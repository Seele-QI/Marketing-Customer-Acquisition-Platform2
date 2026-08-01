"use client"

import Image from "next/image"
import * as React from "react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import {
  ArrowLeft,
  Bot,
  Check,
  ChevronDown,
  CircleStop,
  Clock3,
  CloudCog,
  FileCheck2,
  Send,
  ShieldCheck,
  UsersRound,
} from "lucide-react"

import { AgentTaskTrace } from "@/components/agents/agent-task-trace"
import { AttachmentStrip } from "@/components/agents/attachment-strip"
import { CollaborationPanel } from "@/components/agents/collaboration-panel"
import type { AgentAttachment } from "@/lib/agents/attachments"
import {
  listEnterpriseAgentRuns,
  planEnterpriseAgentTask,
  promoteAgentKnowledge,
  runEnterpriseAgent,
  type EnterpriseAgentRunHistory,
  type EnterpriseAgentRunResponse,
} from "@/lib/agents/client"
import type { AgentTaskTraceStep } from "@/lib/agents/task-trace"
import { getTeamAgentByName, TEAM_AGENTS } from "@/lib/team-agents"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  attachments?: string[]
}

const STARTING_TRACE: AgentTaskTraceStep[] = [
  {
    id: "intake",
    kind: "intake",
    label: "读取任务与附件",
    detail: "正在建立任务证据边界",
    status: "active",
  },
]

function failedTrace(
  current: readonly AgentTaskTraceStep[],
  detail: string,
): AgentTaskTraceStep[] {
  const steps = current.length ? [...current] : [...STARTING_TRACE]
  const hasFinalize = steps.some((step) => step.id === "finalize")
  const updated = steps.map((step) =>
    step.status === "active" || step.id === "finalize"
      ? { ...step, detail, status: "failed" as const }
      : step,
  )
  if (!hasFinalize) {
    updated.push({
      id: "finalize",
      kind: "finalize",
      label: "形成可复核结论",
      detail,
      status: "failed",
    })
  }
  return updated
}

export function TeamChatWorkspace({
  agentName,
  onAgentSwitch,
  onBack,
}: {
  agentName: string
  agentAvatarUrl?: string
  agentRole?: string
  onAgentSwitch?: (name: string) => void
  onBack?: () => void
}) {
  const agent = getTeamAgentByName(agentName) ?? TEAM_AGENTS[0]
  const [prompt, setPrompt] = React.useState("")
  const [attachments, setAttachments] = React.useState<AgentAttachment[]>([])
  const [collaboration, setCollaboration] = React.useState(true)
  const [isRunning, setIsRunning] = React.useState(false)
  const [run, setRun] = React.useState<EnterpriseAgentRunResponse | null>(null)
  const [trace, setTrace] = React.useState<AgentTaskTraceStep[]>([])
  const [historyRuns, setHistoryRuns] = React.useState<EnterpriseAgentRunHistory[]>([])
  const [messages, setMessages] = React.useState<Message[]>([])
  const [error, setError] = React.useState("")
  const abortRef = React.useRef<AbortController | null>(null)
  const promoted = React.useRef(new Set<string>())
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    })
  }, [messages, trace, isRunning])

  const refreshHistory = React.useCallback(async () => {
    setHistoryRuns(await listEnterpriseAgentRuns())
  }, [])

  React.useEffect(() => {
    void refreshHistory()
  }, [refreshHistory])

  if (!agent) return null
  const hasPreparing = attachments.some((item) => item.status === "preparing")
  const userMessages = messages.filter((message) => message.role === "user")
  const assistantMessages = messages.filter((message) => message.role === "assistant")

  const submit = async () => {
    const task = prompt.trim()
    if (!task || isRunning || hasPreparing) return

    setError("")
    setIsRunning(true)
    setRun(null)
    setTrace(STARTING_TRACE)
    const controller = new AbortController()
    abortRef.current = controller
    setMessages([
      {
        id: crypto.randomUUID(),
        role: "user",
        content: task,
        attachments: attachments
          .filter((item) => item.status === "ready")
          .map((item) => item.name),
      },
    ])
    setPrompt("")

    try {
      try {
        const planned = await planEnterpriseAgentTask({
          agentId: agent.id,
          prompt: task,
          collaboration,
          signal: controller.signal,
        })
        setTrace(planned.trace)
      } catch (cause) {
        if (controller.signal.aborted) throw cause
        setTrace((current) =>
          failedTrace(current, "分诊预览暂不可用，任务将继续由服务端安全编排"),
        )
      }

      const promotionWarnings: string[] = []
      for (const attachment of attachments) {
        if (
          attachment.status !== "ready" ||
          attachment.scope === "temporary" ||
          promoted.current.has(attachment.id)
        ) {
          continue
        }
        try {
          await promoteAgentKnowledge({ attachment, departmentId: agent.id })
          promoted.current.add(attachment.id)
        } catch {
          promotionWarnings.push(
            `${attachment.name} 未能写入知识库，但仍用于本次任务`,
          )
        }
      }

      const response = await runEnterpriseAgent({
        agentId: agent.id,
        prompt: task,
        collaboration,
        attachments,
        signal: controller.signal,
      })
      response.result.warnings.push(...promotionWarnings)
      setRun(response)
      setTrace(response.result.trace)
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: response.result.finalText,
        },
      ])
      void refreshHistory()
    } catch (cause) {
      const stopped = controller.signal.aborted
      const message = stopped
        ? "任务已停止"
        : cause instanceof Error
          ? cause.message
          : "任务执行失败"
      setTrace((current) => failedTrace(current, message))
      setError(message)
    } finally {
      abortRef.current = null
      setIsRunning(false)
    }
  }

  const openHistory = (item: EnterpriseAgentRunHistory) => {
    const historyAgent = TEAM_AGENTS.find(
      (candidate) => candidate.id === item.agent_id,
    )
    if (historyAgent && historyAgent.id !== agent.id) {
      onAgentSwitch?.(historyAgent.name)
    }
    setRun(null)
    setTrace([])
    setError("")
    setMessages([
      { id: `${item.id}:prompt`, role: "user", content: item.prompt },
      ...(item.result?.finalText
        ? [
            {
              id: `${item.id}:result`,
              role: "assistant" as const,
              content: item.result.finalText,
            },
          ]
        : []),
    ])
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f5f7fa] text-slate-950 dark:bg-[#080c12] dark:text-slate-100">
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#0f151e] sm:px-6">
        <button
          type="button"
          onClick={onBack}
          className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          aria-label="返回智能体中心"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative h-10 w-10 overflow-hidden rounded-xl bg-slate-200">
          <Image
            src={agent.avatar}
            alt={`${agent.name}头像`}
            fill
            sizes="40px"
            className="object-cover"
          />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">
            {agent.name} · {agent.role.split(" · ")[0]}
          </h1>
          <p className="truncate text-[11px] text-slate-500">
            {agent.department} · {agent.level}
          </p>
        </div>

        <div className="relative ml-auto hidden sm:block">
          <select
            value={agent.name}
            onChange={(event) => onAgentSwitch?.(event.target.value)}
            className="h-9 appearance-none rounded-xl border border-slate-200 bg-white pl-3 pr-9 text-xs font-semibold text-slate-600 outline-none transition focus:border-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            aria-label="切换企业智能体"
          >
            {TEAM_AGENTS.map((item) => (
              <option key={item.id} value={item.name}>
                {item.department} · {item.name}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-slate-400" />
        </div>

        <span
          title="云端智能路由"
          className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <CloudCog className="h-3.5 w-3.5" />
          DeepSeek 快速通道 · 云端下发
        </span>
        <label className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
          <input
            type="checkbox"
            checked={collaboration}
            onChange={(event) => setCollaboration(event.target.checked)}
            className="accent-blue-700"
          />
          自动会签
        </label>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_320px]">
        <main className="flex min-h-0 min-w-0 flex-col bg-[#f8fafc] dark:bg-[#0a0f16]">
          <div
            ref={scrollRef}
            className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8 lg:px-12"
          >
            {!messages.length && !trace.length ? (
              <section className="mx-auto max-w-3xl py-6 sm:py-12">
                <p className="text-xs font-bold tracking-[0.2em] text-blue-700 uppercase dark:text-blue-300">
                  {agent.department}
                </p>
                <h2 className="mt-3 max-w-2xl font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
                  把材料交给{agent.name}，获得可复核的专业工作底稿
                </h2>
                <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500">
                  {agent.description}
                  模型由服务端专用 DeepSeek
                  快速通道下发，任务将以可审计业务节点展示。
                </p>
                <div className="mt-7 grid gap-3 sm:grid-cols-2">
                  {agent.quickPrompts.map((item) => (
                    <button
                      key={item.text}
                      type="button"
                      onClick={() => setPrompt(item.text)}
                      className="rounded-2xl border border-slate-200 bg-white p-4 text-left text-sm leading-6 text-slate-700 shadow-sm transition hover:border-blue-400 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-blue-950/20"
                    >
                      {item.text}
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="mx-auto max-w-3xl space-y-5">
                {userMessages.map((message) => (
                  <article
                    key={message.id}
                    className="ml-auto max-w-[88%] rounded-2xl border border-blue-200 bg-blue-50/80 p-5 dark:border-blue-900 dark:bg-blue-950/20"
                  >
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <UsersRound className="h-3.5 w-3.5" />
                      任务发起人
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {message.content}
                    </p>
                    {message.attachments?.length ? (
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
                        <FileCheck2 className="h-3.5 w-3.5" />
                        {message.attachments.join("、")}
                      </p>
                    ) : null}
                  </article>
                ))}

                <AgentTaskTrace steps={trace} />

                {assistantMessages.map((message) => (
                  <article
                    key={message.id}
                    className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
                  >
                    <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      <Bot className="h-3.5 w-3.5" />
                      {agent.name} · 专业结论
                    </div>
                    <div className="prose prose-sm max-w-none leading-7 dark:prose-invert">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </article>
                ))}

                {error ? (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/20 dark:text-rose-300">
                    {error}
                  </div>
                ) : null}
                {run?.result.status === "partial" ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs font-semibold text-amber-800 dark:border-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                    部分完成：主责结果可用，但至少一项会签或汇总未完成，请查看任务处理链。
                  </div>
                ) : null}
                {run?.result.warnings.length ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-6 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-200">
                    {run.result.warnings.join("；")}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-slate-200 bg-white/95 px-4 py-4 backdrop-blur dark:border-slate-800 dark:bg-[#0a0f16]/95 sm:px-8">
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-300 bg-white p-3 shadow-[0_14px_40px_rgba(15,23,42,.10)] dark:border-slate-700 dark:bg-slate-900">
              <AttachmentStrip
                attachments={attachments}
                onChange={setAttachments}
                disabled={isRunning}
              />
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault()
                    void submit()
                  }
                }}
                placeholder={`向${agent.department}说明任务、期限和期望交付物…`}
                rows={2}
                className="mt-2 w-full resize-none bg-transparent px-2 py-2 text-sm leading-6 outline-none placeholder:text-slate-400"
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-1 pt-3 dark:border-slate-700">
                <p className="text-[10px] text-slate-400">
                  附件视为不可信证据 · 高风险外部动作必须审批
                </p>
                {isRunning ? (
                  <button
                    type="button"
                    onClick={() => abortRef.current?.abort()}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-bold text-white"
                  >
                    <CircleStop className="h-4 w-4" />
                    停止
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!prompt.trim() || hasPreparing}
                    onClick={() => void submit()}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[#173d70] px-4 text-xs font-bold text-white transition hover:bg-[#214f89] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="h-4 w-4" />
                    发起任务
                  </button>
                )}
              </div>
            </div>
          </div>
        </main>

        <aside className="hidden min-h-0 overflow-y-auto border-l border-slate-200 bg-[#f6f7f9] p-4 lg:block dark:border-slate-800 dark:bg-[#0c121a]">
          <CollaborationPanel run={run} />

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-blue-700" />
              <h3 className="text-sm font-semibold">最近任务</h3>
            </div>
            <div className="mt-3 space-y-1">
              {historyRuns.slice(0, 5).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openHistory(item)}
                  className="block w-full rounded-lg px-2 py-2 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <p className="truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                    {item.prompt}
                  </p>
                  <p className="mt-0.5 text-[9px] text-slate-400">{item.status}</p>
                </button>
              ))}
              {!historyRuns.length ? (
                <p className="py-2 text-[10px] text-slate-400">暂无已保存任务</p>
              ) : null}
            </div>
          </section>

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-blue-700" />
              <h3 className="text-sm font-semibold">审批与执行</h3>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              当前没有待审批动作。报价外发、正式发布、通知客户等 T2
              动作会在这里列明目标、参数与有效期。
            </p>
            <button
              type="button"
              disabled
              className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-400 dark:border-slate-700"
            >
              <Check className="h-3.5 w-3.5" />
              审批后方可执行
            </button>
          </section>

          {run ? (
            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-xs dark:border-slate-700 dark:bg-slate-900">
              <p className="font-semibold">任务凭证</p>
              <dl className="mt-3 space-y-2 text-slate-500">
                <div className="flex justify-between gap-3">
                  <dt>任务 ID</dt>
                  <dd className="truncate font-mono">{run.runId}</dd>
                </div>
                <div className="flex justify-between">
                  <dt>模型选路</dt>
                  <dd>服务端 · {run.result.modelRouting.successfulCalls} 次</dd>
                </div>
                <div className="flex justify-between">
                  <dt>积分</dt>
                  <dd>{run.billing.chargedCredits}</dd>
                </div>
              </dl>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}
