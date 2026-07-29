"use client"

import { useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  Crosshair,
  FolderKanban,
  HelpCircle,
  ListChecks,
  Loader2,
  MessageCircle,
  PanelRightClose,
  Send,
  Sparkles,
  X,
} from "lucide-react"

import { createBusinessAssistantClient } from "@/lib/business-assistant/client"
import { useBusinessAssistant } from "@/lib/business-assistant/context"
import { getBusinessAssistant } from "@/lib/business-assistant/registry"
import type {
  BusinessAssistantMessage,
  BusinessAssistantSuggestedAction,
} from "@/lib/business-assistant/types"
import { VIDEO_VIEWS } from "@/lib/video/workspace"
import { GEO_VIEWS } from "@/lib/geo/workspace"
import { cn } from "@/lib/utils"

type Tab = "guide" | "ask" | "progress"

type LocalMessage = {
  id: string
  role: "user" | "assistant"
  content: string
}

const QUICK_QUESTIONS = ["这一页怎么开始？", "完成标准是什么？", "遇到问题怎么办？"]

export function BusinessAssistantShell() {
  const assistant = useBusinessAssistant()
  const client = useMemo(() => createBusinessAssistantClient(), [])
  const [tab, setTab] = useState<Tab>("guide")
  const [input, setInput] = useState("")
  const [sending, setSending] = useState(false)
  const [error, setError] = useState("")
  const [localMessages, setLocalMessages] = useState<LocalMessage[]>([])
  const detail = assistant.activeProject
  const guide = assistant.activeGuide
  const step = assistant.currentGuideStep
  const definition = guide
    ? getBusinessAssistant(guide.assistantId)
    : detail
      ? getBusinessAssistant(detail.project.assistantId)
      : undefined

  useEffect(() => {
    setTab("guide")
    setLocalMessages([])
    setError("")
  }, [assistant.activeView])

  useEffect(() => {
    if (tab === "progress" && !assistant.projectsLoaded) {
      assistant.refreshProjects().catch(() => undefined)
    }
  }, [assistant.projectsLoaded, assistant.refreshProjects, tab])

  const applyAction = async (action: BusinessAssistantSuggestedAction) => {
    if (!detail) return
    try {
      if (action.type === "navigate") {
        assistant.navigate(action.view)
        return
      }
      const project = await client.replaceSteps(
        detail.project.id,
        detail.project.revision,
        action.steps.map((item, index) => ({
          ...item,
          status: index === 0 ? "active" : "pending",
          orderIndex: index,
        })),
      )
      assistant.updateActiveProject({ ...detail, project })
      setTab("progress")
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "计划更新失败，请稍后重试")
    }
  }

  const localGuideAnswer = (question: string): string => {
    if (!guide || !step) {
      return "当前页面没有配置专属助理。请进入“视频创作”或“GEO 创作”页面，我会按页面控件逐步指导。"
    }
    if (/完成|标准|结果/.test(question)) {
      return `当前步骤“${step.title}”的完成标准：${step.completionCriteria}`
    }
    if (/问题|失败|不能|报错/.test(question)) {
      return guide.commonIssues
        .map((item) => `${item.problem}：${item.solution}`)
        .join("\n")
    }
    return `这一页用于：${guide.purpose}\n\n现在先做“${step.title}”：${step.instruction}`
  }

  const send = async (preset?: string) => {
    const message = (preset ?? input).trim()
    if (!message || sending) return
    setInput("")
    setError("")

    if (!detail) {
      const stamp = Date.now()
      setLocalMessages((current) => [
        ...current,
        { id: `question-${stamp}`, role: "user", content: message },
        {
          id: `answer-${stamp}`,
          role: "assistant",
          content: localGuideAnswer(message),
        },
      ])
      return
    }

    setSending(true)
    const optimistic: BusinessAssistantMessage = {
      id: `local-${Date.now()}`,
      projectId: detail.project.id,
      assistantId: detail.project.assistantId,
      role: "user",
      content: message,
      metadata: {},
      createdAt: Date.now(),
    }
    assistant.updateActiveProject({
      ...detail,
      messages: [...detail.messages, optimistic],
    })
    try {
      const reply = await client.sendMessage({
        projectId: detail.project.id,
        assistantId: detail.project.assistantId,
        message,
        pageContext: assistant.pageContext,
      })
      assistant.updateActiveProject({
        ...detail,
        messages: [
          ...detail.messages,
          optimistic,
          {
            id: `reply-${Date.now()}`,
            projectId: detail.project.id,
            assistantId: detail.project.assistantId,
            role: "assistant",
            content: reply.text,
            metadata: { suggestedActions: reply.suggestedActions },
            createdAt: Date.now(),
          },
        ],
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "助理回复失败，请稍后重试")
    } finally {
      setSending(false)
    }
  }

  if (!assistant.isOpen) {
    return (
      <button
        type="button"
        onClick={() => assistant.setOpen(true)}
        className="fixed bottom-7 right-7 z-40 flex h-14 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-4 text-white shadow-[0_16px_40px_rgba(37,99,235,.35)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_48px_rgba(37,99,235,.42)]"
        aria-label="打开当前页操作助理"
      >
        <Sparkles className="h-5 w-5" />
        <span className="hidden text-sm font-semibold sm:inline">
          {definition?.shortName ?? "操作助理"}
        </span>
      </button>
    )
  }

  const totalSteps = guide?.steps.length ?? 0
  const completedPercent = totalSteps
    ? Math.round(
        ((assistant.guideCompleted ? totalSteps : assistant.guideStepIndex) /
          totalSteps) *
          100,
      )
    : 0

  return (
    <aside className="fixed bottom-5 right-5 top-[86px] z-40 flex w-[min(400px,calc(100vw-24px))] flex-col overflow-hidden rounded-[28px] border border-blue-100/80 bg-white/95 shadow-[0_24px_80px_rgba(15,23,42,.18)] backdrop-blur-xl dark:border-slate-700 dark:bg-slate-950/95">
      <header className="border-b border-slate-100 bg-[radial-gradient(circle_at_top_right,_rgba(99,102,241,.14),_transparent_42%),linear-gradient(135deg,#eff6ff,#fff)] px-5 pb-4 pt-5 dark:border-slate-800 dark:from-blue-950/50">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 dark:shadow-none">
              <Bot className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-950 dark:text-white">
                {definition?.name ?? "全局操作助理"}
              </p>
              <p className="mt-0.5 truncate text-xs text-slate-500">
                {guide?.title ?? "当前页面暂无专属操作流程"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => assistant.setOpen(false)}
            className="rounded-xl p-2 text-slate-400 hover:bg-white hover:text-slate-700"
            aria-label="收起助理"
          >
            <PanelRightClose className="h-5 w-5" />
          </button>
        </div>
        {guide && (
          <div className="mt-4 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-blue-100">
              <div
                className="h-full rounded-full bg-blue-600 transition-[width]"
                style={{ width: `${completedPercent}%` }}
              />
            </div>
            <span className="text-xs font-medium text-blue-700">
              {assistant.guideStepIndex + 1}/{totalSteps}
            </span>
          </div>
        )}
      </header>

      <nav className="grid grid-cols-3 border-b border-slate-100 px-3 dark:border-slate-800">
        {([
          ["guide", ListChecks, "操作指南"],
          ["ask", MessageCircle, "问助理"],
          ["progress", FolderKanban, "我的进度"],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "flex items-center justify-center gap-1.5 border-b-2 px-1 py-3 text-xs",
              tab === key
                ? "border-blue-600 font-semibold text-blue-600"
                : "border-transparent text-slate-500 hover:text-slate-800",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === "guide" && (
          <div className="space-y-4 p-4">
            {guide && step ? (
              <>
                <section className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-500">
                    这个页面能做什么
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {guide.purpose}
                  </p>
                </section>

                <section>
                  <p className="mb-2 text-xs font-semibold text-slate-500">
                    开始前准备
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {guide.preparation.map((item) => (
                      <span
                        key={item}
                        className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-600"
                      >
                        <Check className="h-3 w-3 text-emerald-500" />
                        {item}
                      </span>
                    ))}
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="rounded-full bg-blue-600 px-2.5 py-1 text-[11px] font-semibold text-white">
                      当前第 {assistant.guideStepIndex + 1} 步
                    </span>
                    <span className="text-xs text-slate-400">
                      共 {totalSteps} 步
                    </span>
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-slate-950">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {step.instruction}
                  </p>
                  <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      做完的判断标准
                    </p>
                    <p className="mt-1 text-xs leading-5 text-emerald-800">
                      {step.completionCriteria}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={assistant.requestHighlight}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    <Crosshair className="h-4 w-4" />
                    定位到当前操作
                  </button>
                  {assistant.targetMissing && (
                    <p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-amber-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      当前控件暂未显示，先按上方说明完成前置操作，或切回对应业务页面。
                    </p>
                  )}
                </section>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={assistant.guideStepIndex === 0}
                    onClick={assistant.previousGuideStep}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-600 disabled:opacity-40"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    上一步
                  </button>
                  <button
                    type="button"
                    disabled={assistant.guideCompleted}
                    onClick={
                      assistant.guideStepIndex >= totalSteps - 1
                        ? assistant.completeGuide
                        : assistant.nextGuideStep
                    }
                    className="flex flex-[1.35] items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white disabled:bg-emerald-600"
                  >
                    {assistant.guideCompleted ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        本页流程已完成
                      </>
                    ) : assistant.guideStepIndex >= totalSteps - 1 ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        确认完成本页流程
                      </>
                    ) : (
                      <>
                        我已完成，下一步
                        <ArrowRight className="h-4 w-4" />
                      </>
                    )}
                  </button>
                </div>

                <details className="rounded-2xl border border-slate-200 bg-white p-4">
                  <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                    常见问题
                  </summary>
                  <div className="mt-3 space-y-3">
                    {guide.commonIssues.map((item) => (
                      <div key={item.problem}>
                        <p className="text-xs font-semibold text-slate-700">
                          {item.problem}
                        </p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          {item.solution}
                        </p>
                      </div>
                    ))}
                  </div>
                </details>
              </>
            ) : (
              <section className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                <HelpCircle className="mx-auto h-9 w-9 text-slate-300" />
                <h3 className="mt-3 font-semibold text-slate-900">
                  当前页面没有专属助理
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  身份定位和海报图创作保持独立使用。操作助理目前只覆盖视频创作与 GEO 创作。
                </p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => assistant.navigate(VIDEO_VIEWS.DH_VIDEO_V2)}
                    className="rounded-xl bg-blue-600 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    去视频创作
                  </button>
                  <button
                    type="button"
                    onClick={() => assistant.navigate(GEO_VIEWS.KNOWLEDGE_BASE)}
                    className="rounded-xl border border-blue-200 px-3 py-2.5 text-sm font-semibold text-blue-700"
                  >
                    去 GEO 创作
                  </button>
                </div>
              </section>
            )}
          </div>
        )}

        {tab === "ask" && (
          <div className="flex min-h-full flex-col p-4">
            <div className="flex-1 space-y-3">
              {!detail && localMessages.length === 0 && (
                <div className="rounded-2xl bg-blue-50 p-4 text-sm leading-6 text-blue-950">
                  我会直接根据当前页面和步骤回答操作问题，不需要先创建项目。
                </div>
              )}
              {(detail?.messages ?? localMessages).map((message) => {
                const actions =
                  "metadata" in message &&
                  Array.isArray(message.metadata.suggestedActions)
                    ? (message.metadata
                        .suggestedActions as BusinessAssistantSuggestedAction[])
                    : []
                return (
                  <div key={message.id}>
                    <div
                      className={cn(
                        "max-w-[92%] whitespace-pre-wrap rounded-2xl px-3.5 py-3 text-sm leading-6",
                        message.role === "user"
                          ? "ml-auto bg-blue-600 text-white"
                          : "bg-slate-100 text-slate-700",
                      )}
                    >
                      {message.content}
                    </div>
                    {actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {actions.map((action, index) => (
                          <button
                            key={`${action.type}-${index}`}
                            type="button"
                            onClick={() => applyAction(action)}
                            className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                          >
                            {action.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {QUICK_QUESTIONS.map((question) => (
                <button
                  key={question}
                  type="button"
                  onClick={() => send(question)}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:border-blue-300 hover:text-blue-700"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>
        )}

        {tab === "progress" && (
          <div className="space-y-4 p-4">
            {guide && (
              <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900">
                    当前页面进度
                  </p>
                  <span className="text-xs font-semibold text-blue-700">
                    {completedPercent}%
                  </span>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  正在进行：{step?.title}
                </p>
              </section>
            )}

            <section>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">长期创作项目</p>
                {assistant.loading && <Loader2 className="h-4 w-4 animate-spin text-blue-600" />}
              </div>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                项目用于跨页面保存长期目标与 AI 对话，不影响操作指南使用。
              </p>
              {assistant.projectError && (
                <div className="mt-3 flex items-start justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-800">
                  <span>{assistant.projectError}</span>
                  <button type="button" onClick={assistant.clearProjectError}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
              <div className="mt-3 space-y-2">
                {assistant.projects.map((project) => (
                  <button
                    key={project.id}
                    type="button"
                    onClick={() => assistant.openProject(project.id)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-xl border p-3 text-left",
                      detail?.project.id === project.id
                        ? "border-blue-300 bg-blue-50"
                        : "border-slate-200 hover:border-blue-200",
                    )}
                  >
                    <span>
                      <span className="block text-sm font-medium">{project.title}</span>
                      <span className="mt-1 block text-xs text-slate-500">
                        {project.currentStage}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </button>
                ))}
                {assistant.projectsLoaded &&
                  !assistant.loading &&
                  assistant.projects.length === 0 &&
                  !assistant.projectError && (
                    <p className="rounded-xl border border-dashed border-slate-200 py-5 text-center text-xs text-slate-400">
                      暂无长期项目
                    </p>
                  )}
              </div>
              {guide && (
                <button
                  type="button"
                  disabled={assistant.loading}
                  onClick={() =>
                    assistant.createProject(
                      guide.assistantId === "video-creation" ? "video" : "geo",
                    )
                  }
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-blue-700 disabled:opacity-50"
                >
                  <CircleDot className="h-4 w-4" />
                  创建长期{guide.assistantId === "video-creation" ? "视频" : " GEO"}项目
                </button>
              )}
            </section>
          </div>
        )}
      </div>

      {tab === "ask" && (
        <footer className="border-t border-slate-100 p-3 dark:border-slate-800">
          {error && (
            <div className="mb-2 flex items-start justify-between rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
              <span>{error}</span>
              <button type="button" onClick={() => setError("")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 bg-white p-2 focus-within:border-blue-400">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault()
                  send().catch(() => undefined)
                }
              }}
              rows={2}
              placeholder="问这一页怎么操作…"
              className="min-h-10 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none"
            />
            <button
              type="button"
              disabled={!input.trim() || sending}
              onClick={() => send().catch(() => undefined)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white disabled:opacity-40"
              aria-label="发送问题"
            >
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-slate-400">
            只指导与规划；生成、扣费和发布仍由你确认
          </p>
        </footer>
      )}
    </aside>
  )
}
