"use client"

import * as React from "react"
import {
  Plus,
  MessageSquare,
  Send,
  Zap,
  Search,
  Copy,
  Check,
  ChevronLeft,
  MoreHorizontal,
  Sparkles,
  Loader2,
  Trash2,
  User,
  Bot,
  X,
  Clapperboard,
  Paperclip,
} from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { toast } from "@/hooks/use-toast"
import {
  splitCopywritingScriptVersions,
  type CopywritingScriptVersion,
} from "@/lib/copywriting-script-format"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { isLoginRequiredError } from "@/lib/auth/prompt-login"
import {
  consumeBillingAwareSseStream,
  type MemorySseMetadata,
} from "@/lib/credit/balance-sync"
import { MemoryIndicator } from "@/components/memory/memory-indicator"
import { MemoryCenterDialog } from "@/components/memory/memory-center-dialog"
import { useUserMemory } from "@/hooks/use-user-memory"
import {
  type PendingImage,
  MAX_PENDING_IMAGES,
  MAX_IMAGE_FILE_BYTES,
  buildChatImagePayload,
  addImageFilesToPending,
} from "@/lib/chat-image-upload"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number
  attachedImagePreviews?: string[]
}

type HistorySession = {
  id: string
  title: string
  date: string
  messages: Message[]
}

type CopywritingAgent = {
  name: string
  icon: React.ComponentType<{ className?: string }>
  color: string
  description: string
  quickPrompts: string[]
}

type Props = {
  agentName: string
  agentIcon: React.ComponentType<{ className?: string }>
  themeColor?: string
  onBack?: (() => void) | null
  /** 所有可用的智能体列表（供切换） */
  allAgents?: CopywritingAgent[]
  onAgentSwitch?: (agentName: string) => void
  /** 自定义欢迎提示词（不传则用默认） */
  welcomePrompts?: string[]
  /** 跳转至视频创作板块（携带 AI 生成文案） */
  onJumpToVideo?: (script: string) => void
  /** 初始用户消息：组件挂载后自动发送（用于「文案提取 → AI 改写」场景） */
  initialUserMessage?: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const WELCOME_PROMPTS = [
  "帮我写一条小红书种草笔记",
  "生成 3 个短视频爆款标题",
  "帮我润色这段文案，让它更有网感",
  "写一段 30 秒的口播脚本",
  "帮我写一封商务合作邮件",
  "把这段内容改成朋友圈风格",
]

function getDeviceId(): string {
  if (typeof window === "undefined") return "server"
  try {
    const key = "creative-studio-device-user-id"
    let id = localStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID?.() ?? `dev-${Date.now()}`
      localStorage.setItem(key, id)
    }
    return id
  } catch {
    return `fallback-${Date.now()}`
  }
}

function buildStorageKey(agentName: string): string {
  const deviceId = getDeviceId()
  const encoded = encodeURIComponent(agentName)
  return `copywriting-chat:v2:${deviceId}:${encoded}`
}

function loadSessions(agentName: string): HistorySession[] {
  try {
    const raw = localStorage.getItem(buildStorageKey(agentName))
    if (!raw) return []
    const data = JSON.parse(raw) as HistorySession[]
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

function saveSessions(agentName: string, sessions: HistorySession[]): void {
  try {
    localStorage.setItem(buildStorageKey(agentName), JSON.stringify(sessions.slice(0, 100)))
  } catch {
    /* quota */
  }
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function groupSessionsByDate(sessions: HistorySession[]): Record<string, HistorySession[]> {
  const groups: Record<string, HistorySession[]> = {}
  const today = todayStr()
  for (const s of sessions) {
    const key = s.date === today ? "今天" : s.date
    if (!groups[key]) groups[key] = []
    groups[key].push(s)
  }
  return groups
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false)

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ title: "复制失败", variant: "destructive" })
    }
  }, [text])

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] transition-all",
        copied
          ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400"
          : "text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-slate-300",
      )}
    >
      {copied ? (
        <>
          <Check className="h-3 w-3" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-3 w-3" />
          复制
        </>
      )}
    </button>
  )
}

function ScriptVersionCard({
  version,
  index,
  onJumpToVideo,
}: {
  version: CopywritingScriptVersion
  index: number
  onJumpToVideo?: (script: string) => void
}) {
  const title = version.title ?? `口播稿 ${index + 1}`
  const hasPlainText = Boolean(version.plainText.trim())

  return (
    <article className="rounded-2xl border border-slate-200/70 bg-gradient-to-br from-white via-white to-slate-50/80 p-4 shadow-sm dark:border-white/10 dark:from-white/8 dark:via-white/5 dark:to-transparent">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
            Oral Script
          </p>
          <h4 className="mt-1 text-[15px] font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h4>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-300">
          {hasPlainText ? "可直接使用" : "需重新生成"}
        </span>
      </div>

      <div className="mt-4 rounded-xl bg-slate-50/80 p-4 dark:bg-slate-950/40">
        {hasPlainText ? (
          <div className="prose prose-sm max-w-none whitespace-pre-wrap text-slate-700 dark:prose-invert dark:text-slate-200 prose-p:my-1.5 prose-headings:my-2 prose-code:text-[13px]">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{version.plainText}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-[13px] leading-6 text-amber-600 dark:text-amber-300">
            这一版没有提取出可直接朗读的纯口播稿，请调整要求后重新生成。
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {hasPlainText && <CopyButton text={version.plainText} />}
        {onJumpToVideo && (
          <button
            type="button"
            onClick={() => onJumpToVideo(version.plainText)}
            disabled={!hasPlainText}
            className={cn(
              "inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-all",
              hasPlainText
                ? "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-300 dark:hover:bg-rose-500/15"
                : "cursor-not-allowed bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-slate-500",
            )}
          >
            <Clapperboard className="h-3.5 w-3.5" />
            {hasPlainText ? "视频生成跳转" : "暂无可跳转文案"}
          </button>
        )}
      </div>
    </article>
  )
}

function AssistantMessageContent({
  content,
  onJumpToVideo,
}: {
  content: string
  onJumpToVideo?: (script: string) => void
}) {
  const versions = React.useMemo(() => splitCopywritingScriptVersions(content), [content])
  const hasScriptCards = versions.length > 0 && !content.startsWith("**出错了**")

  if (!hasScriptCards) {
    return (
      <div className="prose prose-sm max-w-none dark:prose-invert prose-p:my-1.5 prose-headings:my-2 prose-code:text-[13px]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200/70 bg-slate-50/80 px-3 py-2 text-[12px] text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-400">
        已整理为 {versions.length} 个可直接朗读的口播版本，可单独复制或跳转到视频创作。
      </div>
      <div className="grid gap-3">
        {versions.map((version, index) => (
          <ScriptVersionCard
            key={`${version.title ?? "script"}-${index}`}
            version={version}
            index={index}
            onJumpToVideo={onJumpToVideo}
          />
        ))}
      </div>
    </div>
  )
}

function PresetQuestions({
  prompts,
  onSelect,
}: {
  prompts: string[]
  onSelect: (text: string) => void
}) {
  if (prompts.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2">
      {prompts.map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="rounded-full border border-slate-200/60 bg-white px-4 py-2 text-[13px] text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-800 dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:bg-white/10 dark:hover:text-slate-200"
        >
          {p}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function CopywritingChatWorkspace({
  agentName,
  agentIcon: AgentIcon,
  themeColor = "var(--color-blue-500)",
  onBack,
  allAgents,
  onAgentSwitch,
  welcomePrompts,
  onJumpToVideo,
  initialUserMessage,
}: Props) {
  const { requireLogin, promptLogin } = useLoginRequired()
  const memory = useUserMemory()
  const [sessions, setSessions] = React.useState<HistorySession[]>(() => loadSessions(agentName))
  const [activeSessionId, setActiveSessionId] = React.useState<string | null>(null)
  const [messages, setMessages] = React.useState<Message[]>([])
  const [inputValue, setInputValue] = React.useState("")
  const [isSending, setIsSending] = React.useState(false)
  const [sidebarSearch, setSidebarSearch] = React.useState("")
  const [memoryCenterOpen, setMemoryCenterOpen] = React.useState(false)
  const [lastUsedMemory, setLastUsedMemory] = React.useState<Array<Record<string, unknown>>>([])
  const textareaRef = React.useRef<HTMLTextAreaElement>(null)
  const scrollAnchorRef = React.useRef<HTMLDivElement>(null)
  const inputValueRef = React.useRef(inputValue)
  inputValueRef.current = inputValue
  const [pendingImages, setPendingImages] = React.useState<PendingImage[]>([])
  const pendingImagesRef = React.useRef(pendingImages)
  pendingImagesRef.current = pendingImages
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const isSendingRef = React.useRef(false)

  const activeSession = activeSessionId ? sessions.find((s) => s.id === activeSessionId) ?? null : null

  // Use custom welcome prompts or fall back to defaults
  const prompts = welcomePrompts ?? WELCOME_PROMPTS

  // Scroll to bottom on messages change
  React.useEffect(() => {
    scrollAnchorRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // Reload sessions when agent changes
  React.useEffect(() => {
    const loaded = loadSessions(agentName)
    setSessions(loaded)
    setActiveSessionId(null)
    setMessages([])
  }, [agentName])

  // Auto-send initialUserMessage on mount (used by 文案提取 → AI 改写 flow)
  const initialSendRef = React.useRef(false)
  React.useEffect(() => {
    if (initialUserMessage && !initialSendRef.current) {
      initialSendRef.current = true
      // Slight delay so the component is fully mounted before sending
      const timer = setTimeout(() => {
        handleSend(initialUserMessage)
      }, 300)
      return () => clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialUserMessage, agentName])

  const removePendingImage = React.useCallback((id: string) => {
    setPendingImages((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((p) => p.id !== id)
    })
  }, [])

  const handleFileChange = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files?.length) return
    addImageFilesToPending(Array.from(files), setPendingImages)
    e.target.value = ""
  }, [])

  const handleSend = React.useCallback(async (text?: string) => {
    const content = (text ?? inputValueRef.current).trim()
    const imgs = pendingImagesRef.current
    if ((!content && imgs.length === 0) || isSendingRef.current) return

    isSendingRef.current = true
    setInputValue("")
    setIsSending(true)

    let imagePayload: Awaited<ReturnType<typeof buildChatImagePayload>> | undefined
    let imageDataUrlsForHistory: string[] | undefined
    if (imgs.length > 0) {
      imagePayload = await buildChatImagePayload(imgs)
      imageDataUrlsForHistory = imagePayload.map(
        (p) => `data:${p.mimeType};base64,${p.dataBase64}`,
      )
      setPendingImages((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.previewUrl))
        return []
      })
    }

    const userBubbleContent =
      content || (imagePayload?.length ? `已上传${imagePayload.length}张图片` : "")
    const requestSessionId = activeSessionId ?? crypto.randomUUID()

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: userBubbleContent,
      timestamp: Date.now(),
      ...(imageDataUrlsForHistory?.length ? { attachedImagePreviews: imageDataUrlsForHistory } : {}),
    }

    const assistantMsg: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      timestamp: Date.now(),
    }

    const updatedMessages = [...messages, userMsg, assistantMsg]
    setMessages(updatedMessages)

    // Build conversation history
    const history = messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: m.content }))

    try {
      if (!(await requireLogin("登录后可使用 AI 文案对话并扣减积分"))) {
        setMessages((prev) => prev.filter((m) => m.id !== assistantMsg.id && m.id !== userMsg.id))
        setIsSending(false)
        isSendingRef.current = false
        return
      }

      setLastUsedMemory([])
      void memory
        .observeUserTurn({
          scope: "copywriting",
          sessionId: requestSessionId,
          messageId: userMsg.id,
          userMessage: userBubbleContent,
        })
        .then(() => memory.refresh())
        .catch(() => undefined)

      const res = await fetch("/api/ai/chat-stream", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: content,
          agentName,
          conversationHistory: history,
          ...(imagePayload && imagePayload.length > 0 ? { images: imagePayload } : {}),
        }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        const msg = parseApiErrorResponse(res.status, err, "请求失败")
        if (res.status === 401) promptLogin(msg)
        throw new Error(msg)
      }

      let fullResponse = ""
      const onMemory = (metadata: MemorySseMetadata) => {
        setLastUsedMemory(metadata.items)
      }
      await consumeBillingAwareSseStream(
        res,
        (delta) => {
          fullResponse += delta
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id ? { ...m, content: fullResponse } : m,
            ),
          )
        },
        undefined,
        onMemory,
      )

      // Save to sessions
      const finalMessages = [...messages, userMsg, { ...assistantMsg, content: fullResponse }]
      const title = userBubbleContent.slice(0, 40) + (userBubbleContent.length > 40 ? "…" : "")
      const newSession: HistorySession = {
        id: requestSessionId,
        title,
        date: todayStr(),
        messages: finalMessages,
      }

      let updated: HistorySession[]
      if (activeSessionId) {
        updated = sessions.map((s) => (s.id === activeSessionId ? newSession : s))
      } else {
        updated = [newSession, ...sessions]
        setActiveSessionId(newSession.id)
      }
      setSessions(updated)
      saveSessions(agentName, updated)
    } catch (e) {
      const errorText = e instanceof Error ? e.message : "发送失败"
      if (isLoginRequiredError(errorText)) {
        promptLogin(errorText)
      }
      const suffix =
        errorText.includes("请先登录") || errorText.includes("积分不足")
          ? ""
          : "\n\n若持续失败，请保持客户端登录并等待云端模型配置同步完成后重试。"
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsg.id
            ? { ...m, content: `**出错了**：${errorText}${suffix}` }
            : m,
        ),
      )
    } finally {
      setIsSending(false)
      isSendingRef.current = false
    }
  }, [messages, agentName, activeSessionId, sessions, memory, requireLogin, promptLogin])

  const handleNewChat = React.useCallback(() => {
    setActiveSessionId(null)
    setMessages([])
  }, [])

  const handleSelectSession = React.useCallback((session: HistorySession) => {
    setActiveSessionId(session.id)
    setMessages(session.messages)
  }, [])

  const handleDeleteSession = React.useCallback(
    (id: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const updated = sessions.filter((s) => s.id !== id)
      setSessions(updated)
      saveSessions(agentName, updated)
      if (activeSessionId === id) {
        setActiveSessionId(null)
        setMessages([])
      }
    },
    [sessions, agentName, activeSessionId],
  )

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend],
  )

  const filteredSessions = sidebarSearch
    ? sessions.filter((s) => s.title.toLowerCase().includes(sidebarSearch.toLowerCase()))
    : sessions

  const grouped = groupSessionsByDate(filteredSessions)

  return (
    <div
      className="flex h-full min-h-0 flex-1 overflow-hidden bg-background"
      data-tutorial-id="copywriting-workspace"
    >
      {/* ================================================================ */}
      {/*  Left Sidebar (260px) — hidden on narrow screens                 */}
      {/* ================================================================ */}
      <aside
        className="hidden min-h-0 w-[260px] shrink-0 flex-col overflow-hidden border-r border-border/60 bg-slate-50/50 lg:flex dark:bg-slate-950/50"
        data-copywriting-fixed-sidebar
      >
        {/* Back + Agent list (browse, not menu) */}
        <div className="border-b border-border/40 p-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="mb-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-300"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              返回
            </button>
          )}

          <p className="mb-1.5 px-1 text-[11px] font-medium text-slate-400">创作分身</p>
          {allAgents && onAgentSwitch ? (
            <div className="flex max-h-[200px] flex-col gap-0.5 overflow-y-auto">
              {allAgents.map((a) => {
                const active = a.name === agentName
                return (
                  <button
                    key={a.name}
                    type="button"
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left transition-colors",
                      active
                        ? "bg-white shadow-sm dark:bg-white/10"
                        : "hover:bg-slate-100 dark:hover:bg-white/5",
                    )}
                    onClick={() => onAgentSwitch(a.name)}
                  >
                    <span
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: `${a.color}15` }}
                    >
                      <span style={{ color: a.color }}>
                        <a.icon className="h-3.5 w-3.5" />
                      </span>
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-[13px]",
                        active
                          ? "font-semibold text-foreground"
                          : "font-medium text-slate-600 dark:text-slate-400",
                      )}
                    >
                      {a.name}
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl px-2 py-2">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ backgroundColor: `${themeColor}15` }}
              >
                <span style={{ color: themeColor }}><AgentIcon className="h-4.5 w-4.5" /></span>
              </span>
              <span className="truncate text-[14px] font-semibold">{agentName}</span>
            </div>
          )}
        </div>

        {/* New Chat Button */}
        <div className="px-3 pt-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex w-full items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-600 transition-all hover:border-slate-300 hover:shadow-sm dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20"
          >
            <Plus className="h-4 w-4" />
            新对话
          </button>
        </div>

        {/* Search */}
        <div className="px-3 pt-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              className="w-full rounded-lg border border-slate-200/60 bg-white py-2 pl-9 pr-3 text-[12px] placeholder:text-slate-400 focus:border-slate-300 focus:outline-none dark:border-white/10 dark:bg-white/5 dark:placeholder:text-slate-500"
              placeholder="搜索历史…"
              value={sidebarSearch}
              onChange={(e) => setSidebarSearch(e.target.value)}
            />
          </div>
        </div>

        {/* History List */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-2"
          data-copywriting-history-scroll
        >
          {Object.keys(grouped).length === 0 && (
            <p className="py-8 text-center text-[12px] text-slate-400">暂无对话记录</p>
          )}
          {Object.entries(grouped).map(([dateLabel, items]) => (
            <div key={dateLabel} className="mb-3">
              <p className="mb-1 px-2 text-[11px] font-medium text-slate-400">{dateLabel}</p>
              {items.map((s) => (
                <div
                  key={s.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => handleSelectSession(s)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault()
                      handleSelectSession(s)
                    }
                  }}
                  className={cn(
                    "group flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors",
                    activeSessionId === s.id
                      ? "bg-slate-200/60 dark:bg-white/10"
                      : "hover:bg-slate-100 dark:hover:bg-white/5",
                  )}
                >
                  <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600 dark:text-slate-400">
                    {s.title}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => handleDeleteSession(s.id, e)}
                    className="shrink-0 rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-200 hover:text-rose-500 group-hover:opacity-100 dark:hover:bg-white/10"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* ================================================================ */}
      {/*  Main Chat Area                                                   */}
      {/* ================================================================ */}
      <div className="flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <div className="shrink-0 flex items-center justify-between border-b border-border/40 px-5 py-3">
          <div>
            <h2 className="text-[15px] font-semibold">
              {activeSession?.title ?? agentName}
            </h2>
            {activeSession && (
              <p className="text-[11px] text-slate-400">{activeSession.date}</p>
            )}
          </div>
        </div>

        {/* Messages */}
        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
          data-copywriting-message-scroll
        >
          <div className="mx-auto max-w-[720px] px-5 py-6">
            {messages.length === 0 ? (
              /* Welcome State */
              <div className="flex flex-col items-center gap-6 py-12">
                <span
                  className="flex h-16 w-16 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: `${themeColor}12` }}
                >
                  <span style={{ color: themeColor }}><AgentIcon className="h-8 w-8" /></span>
                </span>
                <div className="text-center">
                  <h3 className="text-[20px] font-semibold">我是 {agentName}</h3>
                  <p className="mt-2 text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
                    告诉我你的需求，我会用专业知识帮你完成创作。
                  </p>
                </div>
                <div className="w-full max-w-md">
                  <p className="mb-3 text-center text-[12px] text-slate-400">你可以这样开始</p>
                  <PresetQuestions
                    prompts={prompts}
                    onSelect={(text) => handleSend(text)}
                  />
                </div>
              </div>
            ) : (
              /* Message List */
              <div className="flex flex-col gap-6">
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex gap-3",
                      msg.role === "user" ? "justify-end" : "justify-start",
                    )}
                  >
                    {/* Avatar */}
                    {msg.role === "assistant" && (
                      <span
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                        style={{ backgroundColor: `${themeColor}15` }}
                      >
                        <span style={{ color: themeColor }}><AgentIcon className="h-3.5 w-3.5" /></span>
                      </span>
                    )}

                    <div className={cn("max-w-[85%]", msg.role === "user" ? "order-1" : "")}>
                      {/* Bubble */}
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-3 text-[14px] leading-relaxed",
                          msg.role === "user"
                            ? "bg-primary text-primary-foreground"
                            : "border border-border/60 bg-white dark:bg-white/5",
                        )}
                      >
                        {msg.role === "assistant" ? (
                          msg.content ? (
                            <AssistantMessageContent
                              content={msg.content}
                              onJumpToVideo={onJumpToVideo}
                            />
                          ) : (
                            <div className="flex items-center gap-2 text-slate-400">
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span className="text-[13px]">思考中…</span>
                            </div>
                          )
                        ) : (
                          <div className="space-y-2">
                            {msg.attachedImagePreviews && msg.attachedImagePreviews.length > 0 ? (
                              <div className="flex flex-wrap gap-1.5">
                                {msg.attachedImagePreviews.map((src, i) => (
                                  <img
                                    key={`${msg.id}-img-${i}`}
                                    src={src}
                                    alt=""
                                    className="h-16 w-16 rounded-lg object-cover ring-1 ring-white/20"
                                  />
                                ))}
                              </div>
                            ) : null}
                            {msg.content ? (
                              <p className="whitespace-pre-wrap">{msg.content}</p>
                            ) : null}
                          </div>
                        )}
                      </div>

                      {/* Copy Button (assistant only, when content exists) */}
                      {msg.role === "assistant" && msg.content && !splitCopywritingScriptVersions(msg.content).length && (
                        <div className="mt-1 flex justify-start gap-2">
                          <CopyButton text={msg.content} />
                        </div>
                      )}
                    </div>

                    {/* User Avatar */}
                    {msg.role === "user" && (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10">
                        <User className="h-3.5 w-3.5 text-slate-500" />
                      </span>
                    )}
                  </div>
                ))}
                <div ref={scrollAnchorRef} />
              </div>
            )}
          </div>
        </div>

        {/* Input Area — always sticky at bottom */}
        <div
          className="shrink-0 border-t border-border/40 bg-gradient-to-t from-white via-white to-transparent px-4 pb-3 pt-1 dark:from-background dark:via-background sm:px-5 sm:pb-4 sm:pt-2"
          data-copywriting-composer
        >
          <div className="mx-auto flex max-h-[55dvh] max-w-[720px] flex-col gap-2">
            <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain pr-1">
            <MemoryIndicator
              syncStatus={memory.syncStatus}
              summary={memory.summary}
              usedCount={lastUsedMemory.length}
              onOpen={() => setMemoryCenterOpen(true)}
            />

            {/* Preset Questions (show after each AI response, Doubao-style) */}
            {messages.length > 0 && !isSending && (
              <PresetQuestions
                prompts={prompts.slice(0, 4)}
                onSelect={(text) => {
                  setInputValue(text)
                  textareaRef.current?.focus()
                }}
              />
            )}
            </div>

            {/* Input Row */}
            <div className="flex shrink-0 items-end gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSending}
                className="mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200/60 bg-white text-slate-500 transition-colors hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
                aria-label="上传图片"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                accept="image/*"
                onChange={handleFileChange}
              />
              <div className="flex-1 rounded-2xl border border-slate-200/60 bg-white shadow-sm transition-colors focus-within:border-slate-300 focus-within:shadow-md dark:border-white/10 dark:bg-white/5">
                {pendingImages.length > 0 ? (
                  <div className="flex flex-wrap gap-2 border-b border-slate-200/40 px-3 pt-3 pb-2 dark:border-white/10">
                    {pendingImages.map((p) => (
                      <div
                        key={p.id}
                        className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted ring-1 ring-border/50"
                      >
                        <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                        <button
                          type="button"
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background shadow ring-1 ring-border text-muted-foreground hover:text-foreground"
                          onClick={() => removePendingImage(p.id)}
                          aria-label="移除图片"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : null}
                <textarea
                  ref={textareaRef}
                  className="w-full resize-none rounded-2xl bg-transparent px-4 py-3 text-[14px] leading-relaxed placeholder:text-slate-400 focus:outline-none dark:placeholder:text-slate-500"
                  rows={1}
                  placeholder={`给 ${agentName} 发送消息…`}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value)
                    const el = e.target
                    el.style.height = "auto"
                    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
                  }}
                  onPaste={(e) => {
                    const items = e.clipboardData?.items
                    if (!items) return
                    for (let i = 0; i < items.length; i++) {
                      const item = items[i]
                      if (!item.type.startsWith("image/")) continue
                      const file = item.getAsFile()
                      if (!file) continue
                      if (file.size > MAX_IMAGE_FILE_BYTES) {
                        toast({
                          title: "图片过大",
                          description: "单张图片不能超过 20MB",
                          variant: "destructive",
                        })
                        continue
                      }
                      setPendingImages((prev) => {
                        if (prev.length >= MAX_PENDING_IMAGES) return prev
                        const id = crypto.randomUUID()
                        return [...prev, { id, file, previewUrl: URL.createObjectURL(file) }]
                      })
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  disabled={isSending}
                />
              </div>
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={(!inputValue.trim() && pendingImages.length === 0) || isSending}
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-all",
                  (inputValue.trim() || pendingImages.length > 0) && !isSending
                    ? "bg-primary text-primary-foreground shadow-sm hover:opacity-90"
                    : "bg-slate-100 text-slate-400 dark:bg-white/10",
                )}
              >
                {isSending ? (
                  <Loader2 className="h-4.5 w-4.5 animate-spin" />
                ) : (
                  <Send className="h-4.5 w-4.5" />
                )}
              </button>
            </div>
            <p className="shrink-0 text-center text-[11px] text-slate-400">
              AI 生成内容仅供参考 · Enter 发送，Shift+Enter 换行
            </p>
          </div>
        </div>
      </div>
      <MemoryCenterDialog
        open={memoryCenterOpen}
        onOpenChange={setMemoryCenterOpen}
        lastUsedItems={lastUsedMemory}
      />
    </div>
  )
}
