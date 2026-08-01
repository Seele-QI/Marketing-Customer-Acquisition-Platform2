"use client"

import * as React from "react"
import { createPortal } from "react-dom"
import {
  X,
  ExternalLink,
  BarChart3,
  Copy,
  Wand2,
  Loader2,
  Sparkles,
} from "lucide-react"
import {
  publishTimeFromSeed,
  primaryPlatformLabel,
  platformChannelSuffix,
} from "@/lib/publish-time"
import { buildInsightArticleText } from "@/lib/hotspot-insight-variants"
import { HOTSPOT_REWRITE_SYSTEM } from "@/lib/prompts/hotspot-rewrite-system"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

/** 与热点列表行数据字段一致，便于点击传入 */
export type VideoDetailTrendItem = {
  rank: number
  title: string
  platform: string
  hot_value: string
  url?: string
  publishTime?: string
  trend?: "rising" | "hot" | "new" | "live"
}

type VideoDetailModalProps = {
  isOpen: boolean
  onClose: () => void
  trendItem: VideoDetailTrendItem | null
}

/** 去掉每行行首空白（含全角空格），避免模型正文段首缩进 */
function stripLeadingWhitespacePerLine(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/^[\s\u3000]+/u, ""))
    .join("\n")
}

const TREND_LABEL: Record<NonNullable<VideoDetailTrendItem["trend"]>, string> = {
  hot: "高热",
  rising: "爬升",
  new: "新上榜",
  live: "实况",
}

/** 热点详情「一键爆改」用户消息（system 由 HOTSPOT_REWRITE_SYSTEM 限定为不绑定单一平台文风） */
function buildHotspotRewritePrompt(item: VideoDetailTrendItem): string {
  return (
    `【热搜标题】${item.title}\n` +
    `【来源平台】${item.platform}\n\n` +
    `请基于以上信息写一则适合传播场景的短内容：体裁、语气与是否使用 Emoji 由你结合平台与话题自行判断，避免套用单一固定模板；信息具体、分段清晰；不要写开场白说明，直接输出正文。`
  )
}

function formatClientFetchError(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

function resolveExternalUrl(item: VideoDetailTrendItem): string {
  const query = encodeURIComponent(item.title)
  const platform = item.platform ?? ""
  if (item.url && item.url.trim()) return item.url.trim()
  if (platform.includes("全网")) return `https://s.weibo.com/aisearch?q=${query}`
  if (platform.includes("百度")) return `https://www.baidu.com/s?wd=${query}`
  if (platform.includes("腾讯")) return `https://news.qq.com/search?query=${query}`
  if (platform.includes("头条")) return `https://www.toutiao.com/search/?keyword=${query}`
  if (platform.includes("抖音")) return `https://www.douyin.com/search/${query}`
  if (platform.includes("微博")) return `https://s.weibo.com/weibo?q=${query}`
  return `https://s.weibo.com/weibo?q=${query}`
}

export function VideoDetailModal({ isOpen, onClose, trendItem }: VideoDetailModalProps) {
  const modalFrameRef = React.useRef<HTMLDivElement | null>(null)
  const rewriteInFlightRef = React.useRef(false)
  const [mounted, setMounted] = React.useState(false)
  const [articleText, setArticleText] = React.useState("")
  const [isRewriting, setIsRewriting] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  React.useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      window.removeEventListener("keydown", onKey)
      document.body.style.overflow = prev
    }
  }, [isOpen, onClose])

  React.useEffect(() => {
    if (!isOpen) return
    modalFrameRef.current?.scrollTo({ top: 0, behavior: "auto" })
  }, [isOpen, trendItem?.title])

  React.useEffect(() => {
    if (!isOpen || !trendItem) return
    const primary = primaryPlatformLabel(trendItem.platform)
    const channel = platformChannelSuffix(trendItem.platform)
    setArticleText(buildInsightArticleText(trendItem.title, primary, channel, new Date()))
  }, [isOpen, trendItem])

  /** 关闭弹窗时复位「爆改中」，避免请求挂起导致按钮永久加载 */
  React.useEffect(() => {
    if (!isOpen) {
      rewriteInFlightRef.current = false
      setIsRewriting(false)
    }
  }, [isOpen])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(articleText)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1200)
    } catch {
      /* ignore */
    }
  }

  const handleRewrite = async () => {
    if (!trendItem) return
    if (rewriteInFlightRef.current) return
    rewriteInFlightRef.current = true
    setIsRewriting(true)
    const REQUEST_MS = 125_000

    const makeSignal = (): AbortSignal | undefined => {
      try {
        return AbortSignal.timeout(REQUEST_MS)
      } catch {
        return undefined
      }
    }

    const jsonHeaders = { "Content-Type": "application/json", Accept: "application/json" }

    try {
      /** 先走 /api/agent/chat（热搜专用 system）；失败再回退 /api/ai/rewrite（均为 Next 直连 DeepSeek） */
      let response: Response | null = null
      let usedFallback = false
      let agentFetchError: string | null = null

      const signalAgent = makeSignal()
      try {
        response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: jsonHeaders,
          body: JSON.stringify({
            prompt: buildHotspotRewritePrompt(trendItem),
            system_instruction: HOTSPOT_REWRITE_SYSTEM,
          }),
          ...(signalAgent ? { signal: signalAgent } : {}),
        })
      } catch (e) {
        agentFetchError = formatClientFetchError(e)
        console.warn("[handleRewrite] /api/agent/chat 请求异常:", e)
        response = null
      }

      const needFallback =
        response == null ||
        response.status === 500 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504

      if (needFallback) {
        usedFallback = true
        const signalRewrite = makeSignal()
        try {
          response = await fetch("/api/ai/rewrite", {
            method: "POST",
            headers: jsonHeaders,
            body: JSON.stringify({
              original_text: buildHotspotRewritePrompt(trendItem),
              system_instruction: HOTSPOT_REWRITE_SYSTEM,
            }),
            ...(signalRewrite ? { signal: signalRewrite } : {}),
          })
        } catch (e) {
          const rewriteErr = formatClientFetchError(e)
          const origin = window.location.origin
          console.warn("[handleRewrite] /api/ai/rewrite 请求异常:", e)
          setArticleText(
            `⚠️ 网络请求失败\n\n浏览器在发起请求时失败（尚未拿到 HTTP 状态码）。常见原因：只跑了 Next 没跑 FastAPI、页面与 API 不同源、或请求被插件/代理拦截。\n\n` +
              (agentFetchError ? `智能体 /api/agent/chat：${agentFetchError}\n` : "") +
              `爆改 /api/ai/rewrite：${rewriteErr}\n\n` +
              `请检查：\n1. 终端执行 pnpm dev（仅 Next 即可，AI 由 Next 直连 AI 模型）\n2. 浏览器访问 ${origin}\n3. 项目根目录 .env 中已设置 AI 服务密钥 并重启 dev\n\n原始标题：${trendItem.title}`
          )
          return
        }
      }

      if (!response) {
        setArticleText(
          `⚠️ 未收到响应\n\n原始标题：${trendItem.title}`
        )
        return
      }

      let data: {
        reply?: string
        rewritten_text?: string
        status?: string
        detail?: unknown
      }
      const rawText = await response.text()
      try {
        data = rawText.trim() ? (JSON.parse(rawText) as typeof data) : {}
      } catch {
        const preview = rawText.slice(0, 2500)
        console.warn("[handleRewrite] 非 JSON 响应, status:", response.status, preview)
        setArticleText(
          `⚠️ ${parseApiErrorResponse(response.status, {}, "AI 爆改暂时不可用，请稍后重试。")}\n\n原始标题：${trendItem.title}`
        )
        return
      }

      if (!response.ok) {
        const detail = parseApiErrorResponse(response.status, { detail: data.detail }, "AI 爆改暂时不可用")
        console.warn("[handleRewrite] 后端返回错误:", detail)
        setArticleText(
          `⚠️ AI 爆改暂时不可用\n\n${detail}${usedFallback ? "\n\n（已尝试备用服务）" : ""}\n\n原始标题：${trendItem.title}`
        )
        return
      }

      const raw =
        typeof data.reply === "string"
          ? data.reply
          : typeof data.rewritten_text === "string"
            ? data.rewritten_text
            : ""
      if (raw.trim()) {
        setArticleText(stripLeadingWhitespacePerLine(raw))
      } else {
        setArticleText(
          `⚠️ 接口返回成功但未包含正文（reply / rewritten_text）\n\n原始标题：${trendItem.title}`
        )
      }
    } catch (err) {
      console.error("[handleRewrite] 未预期错误:", err)
      setArticleText(
        `⚠️ 发生未知错误\n\n请稍后重试或联系技术支持。\n\n原始标题：${trendItem.title}`
      )
    } finally {
      rewriteInFlightRef.current = false
      setIsRewriting(false)
    }
  }

  if (!mounted || !isOpen || !trendItem) return null

  const primaryLabel = primaryPlatformLabel(trendItem.platform)
  const channelSuffix = platformChannelSuffix(trendItem.platform)
  const displayPublishTime =
    trendItem.publishTime ?? publishTimeFromSeed(`${trendItem.rank}|${trendItem.title}|${trendItem.platform}`)
  const detailHeading = `${primaryLabel}热点详情`
  const draftSectionTitle = `${primaryLabel}文案区`
  const resolvedUrl = resolveExternalUrl(trendItem)
  const trendBadge = trendItem.trend ? TREND_LABEL[trendItem.trend] : null

  const openSource = () => {
    window.open(resolvedUrl, "_blank")
  }

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="video-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/78 backdrop-blur-md"
        aria-label="关闭遮罩"
        onClick={onClose}
      />

      <div className="relative z-10 flex h-full items-center justify-center p-3 sm:p-4">
        <div
          ref={modalFrameRef}
          className="grid h-[min(84dvh,700px)] w-[min(94vw,1140px)] grid-cols-12 gap-0 overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-2xl dark:border-slate-700/80 dark:bg-slate-900"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="col-span-12 flex h-full flex-col border-b border-slate-200 bg-slate-50/60 p-4 dark:border-slate-700 dark:bg-slate-800/70 lg:col-span-3 lg:border-b-0 lg:border-r">
          <div className="mx-auto flex w-full max-w-[240px] flex-1 items-center justify-center">
            <div 
              onClick={openSource}
              className="relative w-full aspect-square overflow-hidden rounded-2xl shadow-md cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600" />
              <div className="absolute -left-24 -top-24 h-64 w-64 rounded-full bg-white/20 blur-3xl" />
              <div className="absolute -right-28 -bottom-28 h-72 w-72 rounded-full bg-black/25 blur-3xl" />
              <div className="absolute inset-0 opacity-[0.18] [background-image:radial-gradient(rgba(255,255,255,.9)_1px,transparent_1px)] [background-size:12px_12px]" />

              <div className="relative flex h-full w-full flex-col items-center justify-center p-6 text-white">
                <div className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold tracking-wide backdrop-blur-sm">
                  {primaryLabel}
                </div>
                <div className="mt-4 rounded-2xl bg-white/15 p-4 backdrop-blur-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M15 3h6v6"/>
                    <path d="M10 14 21 3"/>
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  </svg>
                </div>
                <div className="mt-4 text-center">
                  <div className="text-sm font-semibold tracking-wide">{`跳转 ${primaryLabel} 检索本热点`}</div>
                  <div className="mt-1 line-clamp-2 text-[11px] leading-snug text-white/85" title={resolvedUrl}>
                    {resolvedUrl}
                  </div>
                </div>
              </div>
            </div>
          </div>
          </div>

          <div className="col-span-12 flex h-full min-h-0 flex-col lg:col-span-9">
          <div className="flex min-h-[132px] shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 id="video-detail-title" className="text-lg font-bold tracking-tight text-foreground dark:text-slate-100">
                  {detailHeading}
                </h2>
                {trendBadge ? (
                  <span className="rounded-md border border-primary/25 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                    {trendBadge}
                  </span>
                ) : null}
              </div>
              <p className="mt-2 truncate text-sm font-medium leading-snug text-foreground dark:text-slate-200" title={trendItem.title}>
                {trendItem.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground dark:text-slate-400">
                发布时间：{displayPublishTime}
                <span className="mx-1.5 text-border">·</span>
                热度 {trendItem.hot_value}
                <span className="mx-1.5 text-border">·</span>
                榜单第 {trendItem.rank} 名
                {channelSuffix ? (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    频道 {channelSuffix}
                  </>
                ) : null}
              </p>
              <div className="mt-3 flex flex-nowrap gap-2 pb-2">
                <button
                  type="button"
                  onClick={openSource}
                  title={resolvedUrl}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:bg-slate-100 hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-500 dark:hover:bg-slate-700"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0" />
                  打开原链接
                </button>
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300"
                  title={`本条在 ${trendItem.platform} 下的榜单热度展示值`}
                >
                  <BarChart3 className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  热度快照 {trendItem.hot_value}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-slate-100 hover:text-foreground dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              aria-label="关闭"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex h-full min-h-0 flex-1 flex-col bg-gradient-to-b from-white via-slate-50/40 to-slate-50/80 px-4 py-3 dark:from-slate-900 dark:via-slate-900/95 dark:to-slate-950/90">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="flex shrink-0 items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/15 to-violet-500/15 text-primary shadow-sm ring-1 ring-sky-500/20 dark:from-sky-400/10 dark:to-violet-400/10 dark:ring-sky-400/25">
                  <Sparkles className="h-5 w-5" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold tracking-tight text-slate-800 dark:text-slate-100">
                    {draftSectionTitle}
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground dark:text-slate-400">
                    默认载入「热点简报」要点（简报引导语会随日期轮换），可直接改；「一键爆改」后由 AI 结合来源与话题生成成稿，不固定为某一种平台腔调。
                  </p>
                </div>
              </div>

              <div className="relative mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-sky-200/50 bg-gradient-to-br from-sky-50/80 via-white to-indigo-50/50 shadow-sm ring-1 ring-sky-500/10 dark:border-sky-500/20 dark:from-slate-900/90 dark:via-slate-900 dark:to-indigo-950/40 dark:ring-sky-400/10">
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(ellipse_520px_240px_at_12%_-20%,rgba(56,189,248,0.18),transparent_58%),radial-gradient(ellipse_480px_220px_at_100%_110%,rgba(129,140,248,0.14),transparent_55%)] dark:bg-[radial-gradient(ellipse_520px_240px_at_10%_0%,rgba(56,189,248,0.12),transparent_55%),radial-gradient(ellipse_460px_200px_at_95%_100%,rgba(99,102,241,0.14),transparent_52%)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-[0.22] dark:opacity-[0.12] [background-image:linear-gradient(to_right,rgba(14,165,233,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(99,102,241,0.06)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black_55%,transparent_100%)]"
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute left-4 right-4 top-0 h-px rounded-full bg-gradient-to-r from-transparent via-sky-400/70 to-transparent dark:via-sky-400/40"
                />
                <textarea
                  value={articleText}
                  onChange={(e) => setArticleText(e.target.value)}
                  className="relative z-[1] mt-2 min-h-0 h-full w-full flex-1 resize-none whitespace-pre-wrap rounded-b-2xl rounded-t-[14px] border-0 bg-white/80 p-4 pr-3 text-sm leading-relaxed text-slate-700 shadow-inner outline-none backdrop-blur-[2px] [scrollbar-color:rgb(148_163_184)_rgb(241_245_249)] [scrollbar-width:thin] placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-primary/25 dark:bg-slate-950/55 dark:text-slate-200 dark:[scrollbar-color:rgb(71_85_105)_rgb(30_41_59)] dark:focus-visible:ring-primary/35 dark:[&::-webkit-scrollbar-thumb]:bg-slate-600 dark:[&::-webkit-scrollbar-thumb:hover]:bg-slate-500 dark:[&::-webkit-scrollbar-track]:bg-slate-800 [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-400 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-slate-100/80"
                />
              </div>
            </div>

            <div className="mt-3 flex shrink-0 flex-wrap gap-3 border-t border-slate-200 pt-3 dark:border-slate-700">
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900"
              >
                <Copy className="h-4 w-4" />
                {copied ? "已复制" : "复制文案"}
              </button>
              <button
                type="button"
                onClick={handleRewrite}
                disabled={isRewriting}
                className="inline-flex min-w-[120px] flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-900 hover:bg-slate-900 hover:text-white hover:shadow-md disabled:pointer-events-none disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-100 dark:hover:bg-slate-100 dark:hover:text-slate-900"
              >
                {isRewriting ? (
                  <>
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                    爆改中...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4 shrink-0" />
                    一键爆改
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </div>
  )

  return createPortal(modalContent, document.body)
}

export default VideoDetailModal
