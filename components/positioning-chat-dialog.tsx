"use client"

import * as React from "react"
import { Bot, Loader2, Send, Table2, User } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export type PositioningChatChannel = "persona" | "product" | "deepseek"

export type PositioningChatTurn = { role: "user" | "assistant"; content: string }

export type PositioningArchivePayload = {
  channel: PositioningChatChannel
  /** 用於「最近操作」列表展示 */
  title: string
  /** 完整對話快照（預覽用） */
  transcript: string
  /** 結構化消息，用於「繼續對話」還原上下文 */
  messages: PositioningChatTurn[]
}

type ChatTurn = PositioningChatTurn

const WELCOME: Record<
  PositioningChatChannel,
  { title: string; assistantLabel: string; opening: string }
> = {
  persona: {
    title: "人设档案",
    assistantLabel: "AI",
    opening:
      "你好，我是人设档案助手。请为你的人设起一个便于记忆的名称（例如：摆烂大学生 / 毒舌点评师 / 职场教练），再简单说说你的领域与风格，我可以帮你细化人设标签与表达口径。",
  },
  product: {
    title: "资产 / 产品的建设文档",
    assistantLabel: "AI",
    opening:
      "你好，我是资产与产品建设文档顾问。请描述你的行业、核心产品或服务、以及通常怎样交付给客户；我会帮你梳理交付物清单、建设文档结构与可对外表述的档案。",
  },
  deepseek: {
    title: "AI对话",
    assistantLabel: "AI",
    opening:
      "你好，我是身份定位助手。可结合你在页面顶部选择的「当前阶段」，帮你梳理人设、内容与变现。请先简单说说你的现状或最想解决的一个问题。",
  },
}

type PositioningChatDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  channel: PositioningChatChannel
  stageTitle: string | null
  /** 保存到身份頁「最近操作」人設/產品列表 */
  onSaveArchive?: (payload: PositioningArchivePayload) => void
  /** 從最近操作還原時注入的歷史消息（與父級 key 聯動以強制重置實例） */
  initialMessages?: PositioningChatTurn[] | null
  /** 用户点「重聊」时通知父级：应清除「从存档继续」的 id，避免下次保存误覆盖旧档 */
  onChatRestarted?: () => void
  /** 成功写入「最近操作」后调用：父级可关层叠并滚动到列表区域 */
  onAfterSaveArchive?: () => void
}

function deriveArchiveTitle(messages: ChatTurn[]): string {
  const firstUser = messages.find((m) => m.role === "user")
  if (!firstUser) return ""
  const t = firstUser.content.replace(/\s+/g, " ").trim()
  if (!t) return ""
  if (t.length <= 36) return t
  return `${t.slice(0, 36)}…`
}

function buildTranscript(messages: ChatTurn[]): string {
  return messages.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`).join("\n\n")
}

export function PositioningChatDialog({
  open,
  onOpenChange,
  channel,
  stageTitle,
  onSaveArchive,
  initialMessages = null,
  onChatRestarted,
  onAfterSaveArchive,
}: PositioningChatDialogProps) {
  const meta = WELCOME[channel]
  const [messages, setMessages] = React.useState<ChatTurn[]>([])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    if (!open) return
    if (initialMessages != null && initialMessages.length > 0) {
      setMessages(initialMessages.map((m) => ({ role: m.role, content: m.content })))
      setInput("")
      setError(null)
      return
    }
    const opening = WELCOME[channel].opening
    setMessages([{ role: "assistant", content: opening }])
    setInput("")
    setError(null)
  }, [open, channel, initialMessages])

  React.useEffect(() => {
    if (!open) return
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, open])

  const handleSend = async () => {
    const text = input.trim()
    if (!text || loading) return

    setInput("")
    setError(null)
    const nextUser: ChatTurn = { role: "user", content: text }
    const history = [...messages, nextUser]
    setMessages(history)
    setLoading(true)

    const payload = {
      messages: history.map(({ role, content }) => ({ role, content })),
      stageHint: stageTitle ?? "",
    }

    const apiPath =
      channel === "product" ? "/api/ai/positioning-product-chat" : "/api/ai/positioning-chat"

    try {
      const response = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await response.json()) as { reply?: string; detail?: string }
      if (!response.ok) {
        throw new Error(typeof data.detail === "string" ? data.detail : `HTTP ${response.status}`)
      }
      const reply = typeof data.reply === "string" ? data.reply : ""
      if (!reply) throw new Error("未返回正文")

      setMessages((prev) => [...prev, { role: "assistant", content: reply }])
    } catch (e) {
      const msg = e instanceof Error ? e.message : "发送失败"
      setError(msg)
      setMessages((prev) => prev.slice(0, -1))
      setInput(text)
    } finally {
      setLoading(false)
    }
  }

  const handleRestartChat = () => {
    setMessages([{ role: "assistant", content: WELCOME[channel].opening }])
    setInput("")
    setError(null)
    onChatRestarted?.()
  }

  /** 关闭弹窗（点 X、遮罩、Esc）时静默写入；有用户消息且已接入 onSaveArchive 时与「保存」一致 */
  const flushArchiveOnDismiss = React.useCallback((): boolean => {
    if (!onSaveArchive) return false
    if (!messages.some((m) => m.role === "user")) return false
    let title = deriveArchiveTitle(messages)
    if (!title) {
      title =
        channel === "product"
          ? "产品档案记录"
          : channel === "persona"
            ? "人设档案记录"
            : "AI对话记录"
    }
    const transcript = buildTranscript(messages)
    onSaveArchive({
      channel,
      title,
      transcript,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    })
    toast({
      title: "已保存",
      description:
        channel === "product"
          ? "已写入「最近操作 → 产品档案」。"
          : channel === "persona"
            ? "已写入「最近操作 → 人设档案」。"
            : "已写入「最近操作 → AI对话」。",
    })
    return true
  }, [onSaveArchive, messages, channel])

  const handleSaveArchive = () => {
    if (!onSaveArchive) {
      toast({ title: "无法保存", description: "当前页面未接入档案列表。", variant: "destructive" })
      return
    }
    const hasUser = messages.some((m) => m.role === "user")
    if (!hasUser) {
      toast({
        title: "暂无可保存内容",
        description: "请先发送至少一条你的消息，再保存到最近操作。",
        variant: "destructive",
      })
      return
    }
    flushArchiveOnDismiss()
    onOpenChange(false)
    onAfterSaveArchive?.()
  }

  const handleDialogOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        if (flushArchiveOnDismiss()) {
          onAfterSaveArchive?.()
        }
        onOpenChange(false)
        return
      }
      onOpenChange(true)
    },
    [flushArchiveOnDismiss, onOpenChange, onAfterSaveArchive],
  )

  const assistantBubbleLabel = meta.assistantLabel
  const isProductChannel = channel === "product"
  const canSave = Boolean(onSaveArchive && messages.some((m) => m.role === "user"))
  const archiveTabLabel =
    channel === "product" ? "产品档案" : channel === "deepseek" ? "AI对话" : "人设档案"

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        showCloseButton
      >
        <DialogHeader className="space-y-3 border-b border-border/60 px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg",
                isProductChannel
                  ? "bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-500 shadow-sm ring-1 ring-blue-200/40 dark:from-blue-500/12 dark:to-indigo-500/10 dark:text-blue-400 dark:ring-blue-400/25"
                  : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
              )}
            >
              {isProductChannel ? (
                <Table2 className="h-4 w-4" strokeWidth={2} aria-hidden />
              ) : (
                <Bot className="h-4 w-4" aria-hidden />
              )}
            </span>
            {meta.title}
          </DialogTitle>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <DialogDescription className="space-y-1.5 text-left text-[13px] sm:min-w-0 sm:flex-1">
              <span className="block">
                {stageTitle ? (
                  <>已关联阶段：<span className="font-medium text-foreground">{stageTitle}</span></>
                ) : (
                  <>未选择上方阶段时，将按通用顾问视角回答。</>
                )}
              </span>
              <span className="block text-muted-foreground">
                本入口对应上方「{meta.title}」板块；点「保存」或右上角关闭时，只要已有你的发言，记录会自动出现在页面下方「最近操作」的「{archiveTabLabel}」标签中。
              </span>
            </DialogDescription>
            <div className="flex shrink-0 items-center justify-end gap-2 sm:pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-[12px]"
                onClick={handleRestartChat}
              >
                重聊
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-8 text-[12px]"
                disabled={!canSave}
                onClick={handleSaveArchive}
              >
                保存
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="min-h-[220px] flex-1 space-y-3 overflow-y-auto px-5 py-4"
        >
          {messages.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 24)}`}
              className={cn(
                "max-w-[min(100%,92%)] rounded-2xl px-3.5 py-3 text-[13px] leading-relaxed shadow-sm",
                m.role === "user"
                  ? "ml-auto border border-sky-200/80 bg-gradient-to-br from-sky-50 to-sky-100/40 text-slate-800 dark:border-sky-500/35 dark:from-sky-950/45 dark:to-sky-900/25 dark:text-slate-100"
                  : isProductChannel
                    ? "mr-auto border border-blue-200/75 bg-gradient-to-br from-blue-50/95 to-indigo-50/50 text-slate-800 dark:border-blue-500/28 dark:from-blue-950/35 dark:to-slate-950/40 dark:text-slate-100"
                    : "mr-auto border border-violet-200/70 bg-gradient-to-br from-violet-50/90 to-slate-50 text-slate-800 dark:border-violet-500/25 dark:from-violet-950/40 dark:to-slate-950/35 dark:text-slate-100",
              )}
            >
              <div className="mb-1.5 flex items-center gap-1.5">
                {m.role === "user" ? (
                  <User className="h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" aria-hidden />
                ) : isProductChannel ? (
                  <Table2 className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" strokeWidth={2} aria-hidden />
                ) : (
                  <Bot className="h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" aria-hidden />
                )}
                <span
                  className={cn(
                    "text-[11px] font-semibold uppercase tracking-wide",
                    m.role === "user"
                      ? "text-sky-700/90 dark:text-sky-300/90"
                      : isProductChannel
                        ? "text-blue-700/90 dark:text-blue-300/90"
                        : "text-violet-700/90 dark:text-violet-300/90",
                  )}
                >
                  {m.role === "user" ? "你" : assistantBubbleLabel}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words">{m.content}</p>
            </div>
          ))}
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              正在生成…
            </div>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-[12px] text-destructive">{error}</p>
          ) : null}
        </div>

        <div className="border-t border-border/60 p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  void handleSend()
                }
              }}
              placeholder="Shift+Enter 换行，Enter 发送"
              rows={2}
              className="min-h-[72px] flex-1 resize-none rounded-xl border border-border/60 bg-background px-3 py-2 text-[13px] outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
              disabled={loading}
            />
            <Button
              type="button"
              size="icon"
              className="h-[72px] w-11 shrink-0"
              onClick={() => void handleSend()}
              disabled={loading || !input.trim()}
              aria-label="发送"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** @deprecated 使用 PositioningChatDialog */
export function DeepSeekPositioningChatDialog(props: {
  open: boolean
  onOpenChange: (open: boolean) => void
  stageTitle: string | null
}) {
  return (
    <PositioningChatDialog
      {...props}
      channel="deepseek"
    />
  )
}
