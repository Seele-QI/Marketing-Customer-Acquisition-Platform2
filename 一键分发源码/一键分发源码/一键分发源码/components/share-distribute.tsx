"use client"

import * as React from "react"
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Film,
  Link2,
  Loader2,
  Sparkles,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { getFastapiBase } from "@/lib/fastapi-base"
import { AUTH_CHANGED_EVENT, getCachedUserId, type AuthChangedDetail } from "@/lib/auth-session"
import type { ShareVideo } from "@/lib/video/types"
import { shareVideosStorageKey } from "@/lib/video/types"
import { addShareVideo, getHistoryRecords, getShareVideos, removeShareVideo } from "@/lib/video/storage"
import { DOUYIN_SUGGESTED_TAGS } from "@/lib/prompts/publish-copy-system"
import { isHttpUrl, resolveMediaUrl } from "@/lib/video/utils"

const DOUYIN_TITLE_MAX = 30
const DOUYIN_DESC_MAX = 1000

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PLATFORM_META: Record<string, { name: string; icon: string }> = {
  douyin: { name: "抖音", icon: "🎵" },
  xiaohongshu: { name: "小红书", icon: "📕" },
  kuaishou: { name: "快手", icon: "⚡" },
  shipinhao: { name: "视频号", icon: "📺" },
}

type BoundAccount = {
  platform: string
  label: string
  nickname: string
  updated_at?: number
}

type PublishResultItem = {
  success: boolean
  platform: string
  url?: string
  error?: string
  metadata?: { message?: string; manual_verification?: boolean }
}

const SOURCE_LABELS: Record<ShareVideo["source"], string> = {
  manual: "手动添加",
  "video-creation": "数字人口播",
  "batch-edit": "批量剪辑",
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

async function copyText(text: string, label = "已复制") {
  try {
    await navigator.clipboard.writeText(text)
    toast({ title: label })
  } catch {
    toast({ title: "复制失败", description: "请手动选择复制", variant: "destructive" })
  }
}

function parseTags(raw: string): string[] {
  return raw
    .split(/[,，\s#]+/)
    .map((t) => t.trim().replace(/^#/, ""))
    .filter(Boolean)
    .slice(0, 5)
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function parseUploadError(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback
  const d = data as Record<string, unknown>
  if (typeof d.detail === "string" && d.detail) return d.detail
  const detail = d.detail
  if (detail && typeof detail === "object" && "message" in detail) {
    const msg = (detail as { message?: string }).message
    if (msg) return msg
  }
  if (typeof d.error === "string" && d.error) return d.error
  return fallback
}

function toAbsoluteVideoUrl(url: string): string {
  const resolved = resolveMediaUrl(url)
  if (isHttpUrl(resolved)) return resolved
  const base = getFastapiBase() || (typeof window !== "undefined" ? window.location.origin : "")
  return `${base.replace(/\/$/, "")}${resolved.startsWith("/") ? resolved : `/${resolved}`}`
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ShareDistribute({ onNavigateToBinding }: { onNavigateToBinding?: () => void } = {}) {
  const [videos, setVideos] = React.useState<ShareVideo[]>([])
  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [tagsText, setTagsText] = React.useState("")
  const [manualUrl, setManualUrl] = React.useState("")
  const [isUploading, setIsUploading] = React.useState(false)
  const [uploadLabel, setUploadLabel] = React.useState("")
  const [uploadError, setUploadError] = React.useState("")
  const [uploadSuccess, setUploadSuccess] = React.useState("")
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isAiFilling, setIsAiFilling] = React.useState(false)
  const [isPublishing, setIsPublishing] = React.useState(false)
  const [publishingPlatform, setPublishingPlatform] = React.useState<string | null>(null)
  const [boundAccounts, setBoundAccounts] = React.useState<BoundAccount[]>([])
  const [selectedPlatforms, setSelectedPlatforms] = React.useState<string[]>([])
  const [publishResults, setPublishResults] = React.useState<PublishResultItem[]>([])
  const [shareUrl, setShareUrl] = React.useState("")
  const [shareToken, setShareToken] = React.useState("")
  const [userId, setUserId] = React.useState<number | null>(null)

  const resetPageState = React.useCallback(() => {
    setVideos([])
    setSelectedId(null)
    setTitle("")
    setDescription("")
    setTagsText("")
    setManualUrl("")
    setUploadLabel("")
    setUploadError("")
    setUploadSuccess("")
    setBoundAccounts([])
    setSelectedPlatforms([])
    setPublishResults([])
    setPublishingPlatform(null)
    setShareUrl("")
    setShareToken("")
  }, [])

  const refreshVideos = React.useCallback(
    (uid?: number | null) => {
      const id = uid ?? userId ?? getCachedUserId()
      if (id == null || id <= 0) {
        setVideos([])
        setSelectedId(null)
        return
      }
      const list = getShareVideos(id)
      setVideos(list)
      setSelectedId((prev) => {
        if (list.length === 0) return null
        if (prev && list.some((v) => v.id === prev)) return prev
        return list[0].id
      })
      setTitle((prev) => {
        if (prev.trim()) return prev
        return list[0]?.title ?? ""
      })
    },
    [userId],
  )

  const loadBoundAccounts = React.useCallback(async () => {
    try {
      const res = await fetch("/api/publish/accounts", { credentials: "include", cache: "no-store" })
      const data = await res.json().catch(() => ({}))
      if (res.status === 401) {
        setBoundAccounts([])
        setSelectedPlatforms([])
        return
      }
      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : (data.detail as { message?: string } | undefined)?.message || "加载绑定账号失败"
        console.warn("[publish/accounts]", msg)
        return
      }
      const accounts: BoundAccount[] = Array.isArray(data.accounts) ? data.accounts : []
      setBoundAccounts(accounts)
      setSelectedPlatforms(accounts.map((a) => a.platform))
    } catch (e) {
      console.warn("[publish/accounts]", e)
    }
  }, [])

  const syncAuth = React.useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      if (!res.ok) {
        setUserId(null)
        resetPageState()
        return
      }
      const data = (await res.json()) as { user?: { id?: number } }
      const id = data.user?.id ?? null
      setUserId(id)
      refreshVideos(id)
      await loadBoundAccounts()
    } catch {
      setUserId(null)
      resetPageState()
    }
  }, [refreshVideos, resetPageState, loadBoundAccounts])

  React.useEffect(() => {
    void syncAuth()
    const onStorage = (e: StorageEvent) => {
      const uid = userId ?? getCachedUserId()
      if (!uid) return
      if (e.key === shareVideosStorageKey(uid) || e.key === null) refreshVideos(uid)
    }
    const onAuthChanged = (e: Event) => {
      const detail = (e as CustomEvent<AuthChangedDetail>).detail
      if (detail?.loggedIn === false) {
        setUserId(null)
        resetPageState()
        return
      }
      void syncAuth()
    }
    window.addEventListener("storage", onStorage)
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    return () => {
      window.removeEventListener("storage", onStorage)
      window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged)
    }
  }, [syncAuth, refreshVideos, userId])

  React.useEffect(() => {
    void loadBoundAccounts()
    const onFocus = () => void loadBoundAccounts()
    window.addEventListener("focus", onFocus)
    return () => window.removeEventListener("focus", onFocus)
  }, [loadBoundAccounts])

  const selectedVideo = videos.find((v) => v.id === selectedId) ?? null
  const activeVideoUrl = selectedVideo?.url || manualUrl.trim()

  const publishBlockedReason = React.useMemo(() => {
    if (!activeVideoUrl) return "请先选择或上传视频"
    if (!title.trim()) return "请填写发布标题"
    if (boundAccounts.length === 0) return "尚未绑定平台账号，需先完成账号绑定"
    if (selectedPlatforms.length === 0) return "请至少选择一个发布平台"
    return ""
  }, [activeVideoUrl, title, boundAccounts.length, selectedPlatforms.length])

  const canPublish = !isPublishing && !publishBlockedReason

  const appendTag = (tag: string) => {
    const normalized = tag.trim().replace(/^#/, "")
    if (!normalized) return
    const existing = parseTags(tagsText)
    if (existing.includes(normalized)) return
    const next = [...existing, normalized].slice(0, 5)
    setTagsText(next.join(", "))
  }

  const handleAiFillCopy = async () => {
    const hint =
      title.trim() ||
      selectedVideo?.title ||
      activeVideoUrl.split("/").pop()?.replace(/\.[^.]+$/, "") ||
      ""
    if (!hint.trim() && !description.trim()) {
      toast({
        title: "请先选择视频或输入主题",
        description: "AI 需要知道视频内容才能填文",
        variant: "destructive",
      })
      return
    }
    setIsAiFilling(true)
    try {
      const platform = selectedPlatforms[0] || boundAccounts[0]?.platform || "douyin"
      const res = await fetch("/api/ai/publish-copy", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hint,
          platform,
          draft: [title, description].filter(Boolean).join("\n"),
        }),
      })
      const data = (await res.json()) as {
        title?: string
        description?: string
        tags?: string[]
        detail?: string | { message?: string }
      }
      if (!res.ok) {
        const detail =
          typeof data.detail === "string"
            ? data.detail
            : (data.detail as { message?: string } | undefined)?.message || "AI 填文失败"
        throw new Error(detail)
      }
      if (data.title) setTitle(data.title.slice(0, DOUYIN_TITLE_MAX))
      if (data.description) setDescription(data.description.slice(0, DOUYIN_DESC_MAX))
      if (Array.isArray(data.tags) && data.tags.length > 0) {
        setTagsText(data.tags.join(", "))
      }
      toast({ title: "AI 填文完成", description: "已生成标题、简介与话题，可继续修改" })
    } catch (e) {
      toast({
        title: "AI 填文失败",
        description: e instanceof Error ? e.message : "请确认已登录且 DeepSeek 密钥已配置",
        variant: "destructive",
      })
    } finally {
      setIsAiFilling(false)
    }
  }

  const handleSelectVideo = (video: ShareVideo) => {
    setSelectedId(video.id)
    setManualUrl("")
    if (!title.trim()) setTitle(video.title)
  }

  const handleRemoveVideo = (video: ShareVideo, e: React.MouseEvent) => {
    e.stopPropagation()
    const uid = userId ?? getCachedUserId()
    const next = removeShareVideo(video.id, uid)
    setVideos(next)
    if (selectedId === video.id) {
      const first = next[0]
      if (first) {
        setSelectedId(first.id)
        setTitle((prev) => prev.trim() || first.title)
      } else {
        setSelectedId(null)
        setTitle("")
        setDescription("")
        setTagsText("")
      }
    }
    toast({ title: "已移除", description: video.title })
  }

  const handleImportFromHistory = () => {
    const history = getHistoryRecords().filter((r) => r.status === "success" && r.videoUrl)
    if (history.length === 0) {
      toast({ title: "暂无可用视频", description: "请先在「视频创作」生成视频", variant: "destructive" })
      return
    }
    const latest = history[0]
    const videoUrl = latest.videoUrl!
    const entry: ShareVideo = {
      id: latest.id,
      title: latest.script.trim().slice(0, 30) || "未命名视频",
      url: videoUrl,
      thumbnail: latest.coverUrl || latest.coverThumbnail,
      source: "video-creation",
      createdAt: latest.createdAt,
    }
    addShareVideo(entry, userId ?? getCachedUserId())
    refreshVideos(userId ?? getCachedUserId())
    handleSelectVideo(entry)
    if (!description.trim() && latest.script) setDescription(latest.script.trim())
    toast({ title: "已从历史记录导入", description: entry.title })
  }

  const handleAddManualUrl = () => {
    const url = manualUrl.trim()
    if (!url) {
      toast({ title: "请输入视频地址", variant: "destructive" })
      return
    }
    const entry: ShareVideo = {
      id: `manual-${Date.now()}`,
      title: title.trim() || "手动添加视频",
      url,
      source: "manual",
      createdAt: Date.now(),
    }
    addShareVideo(entry, userId ?? getCachedUserId())
    setSelectedId(entry.id)
    refreshVideos(userId ?? getCachedUserId())
    toast({ title: "视频已加入分发库" })
  }

  const handleLocalVideoUpload = async (file: File) => {
    const isVideo =
      file.type.startsWith("video/") || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name)
    if (!isVideo) {
      toast({ title: "文件类型不支持", description: "请选择 mp4 / mov / webm 等视频文件", variant: "destructive" })
      return
    }
    setIsUploading(true)
    setUploadError("")
    setUploadSuccess("")
    setUploadLabel(`${file.name} · ${formatFileSize(file.size)}`)
    try {
      const meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" })
      if (!meRes.ok) {
        throw new Error("请先登录后再上传本地视频")
      }
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/video/manual-upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      })
      const data = (await res.json()) as {
        upload_id?: string
        file_url?: string
        original_name?: string
        detail?: unknown
      }
      if (!res.ok || !data.upload_id) {
        throw new Error(parseUploadError(data, "上传失败"))
      }
      const videoUrl = data.file_url || `/static/manual-uploads/${data.upload_id}/source.mp4`
      const baseName = (data.original_name || file.name).replace(/\.[^.]+$/, "")
      const entry: ShareVideo = {
        id: data.upload_id,
        title: title.trim() || baseName || "本地视频",
        url: videoUrl,
        source: "manual",
        createdAt: Date.now(),
      }
      addShareVideo(entry, userId ?? getCachedUserId())
      const nextList = getShareVideos(userId ?? getCachedUserId())
      setVideos(nextList)
      setSelectedId(entry.id)
      setManualUrl("")
      if (!title.trim()) setTitle(entry.title)
      setUploadSuccess(`已添加：${file.name}`)
      toast({ title: "本地视频已上传", description: `${file.name} 已加入待分发列表` })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "请确认已登录且 pnpm dev:api 已启动"
      setUploadError(msg)
      toast({
        title: "上传失败",
        description: msg,
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleAutoPublish = async () => {
    const videoUrl = activeVideoUrl
    const finalTitle = title.trim()
    if (!videoUrl) {
      toast({ title: "请选择或输入视频", variant: "destructive" })
      return
    }
    if (!finalTitle) {
      toast({ title: "请填写发布标题", variant: "destructive" })
      return
    }
    if (selectedPlatforms.length === 0) {
      toast({
        title: "请先绑定平台账号",
        description: "在「账号绑定」页完成抖音/小红书 Cookie 绑定",
        variant: "destructive",
      })
      return
    }

    setIsPublishing(true)
    setPublishResults([])
    setPublishingPlatform(null)

    const platforms = [...selectedPlatforms]
    const perPlatformTimeoutMs = 15 * 60 * 1000
    const collected: PublishResultItem[] = []

    try {
      for (let i = 0; i < platforms.length; i += 1) {
        const platform = platforms[i]
        setPublishingPlatform(platform)
        const controller = new AbortController()
        const timeoutId = window.setTimeout(() => controller.abort(), perPlatformTimeoutMs)
        try {
          const res = await fetch("/api/publish", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            signal: controller.signal,
            body: JSON.stringify({
              platform,
              videoUrl: toAbsoluteVideoUrl(videoUrl),
              title: finalTitle,
              description: description.trim(),
              tags: parseTags(tagsText),
            }),
          })
          const data = await res.json()
          if (!res.ok) {
            const msg =
              typeof data.detail === "string"
                ? data.detail
                : data.detail?.message || data.error || "发布失败"
            throw new Error(msg)
          }
          const item: PublishResultItem = {
            success: Boolean(data.success),
            platform: data.platform || platform,
            url: data.url,
            error: data.error,
            metadata: data.metadata,
          }
          collected.push(item)
          setPublishResults([...collected])
          if (!item.success) {
            toast({
              title: `${PLATFORM_META[platform]?.name || platform} 发布未完成`,
              description: item.error || "请在此 Chrome 窗口完成发布后再试",
              variant: "destructive",
            })
            break
          }
        } catch (e) {
          const aborted = e instanceof DOMException && e.name === "AbortError"
          collected.push({
            success: false,
            platform,
            error: aborted
              ? "等待超时：请在此 Chrome 窗口完成发布"
              : e instanceof Error
                ? e.message
                : "发布失败",
          })
          setPublishResults([...collected])
          toast({
            title: aborted ? "发布等待超时" : "全自动发布失败",
            description: aborted
              ? `「${PLATFORM_META[platform]?.name || platform}」窗口仍打开，请完成发布后再点下一平台`
              : e instanceof Error
                ? e.message
                : "请确认 pnpm dev:api 已启动",
            variant: "destructive",
          })
          break
        } finally {
          window.clearTimeout(timeoutId)
        }
      }

      const ok = collected.filter((r) => r.success).length
      const failed = collected.filter((r) => !r.success)
      const xhsOk = collected.some((r) => r.platform === "xiaohongshu" && r.success)
      const ksOk = collected.some((r) => r.platform === "kuaishou" && r.success)
      const sphOk = collected.some((r) => r.platform === "shipinhao" && r.success)
      if (ok > 0 && ok === collected.length) {
        toast({
          title: `全部发布完成 ${ok}/${platforms.length}`,
          description: xhsOk
            ? "小红书请到 creator.xiaohongshu.com → 笔记管理确认"
            : ksOk
              ? "快手请到 cp.kuaishou.com 作品管理确认"
              : sphOk
                ? "视频号请到 channels.weixin.qq.com 内容管理确认"
                : "请前往抖音创作者中心 → 内容管理 确认作品",
        })
      } else if (ok > 0 && failed.length > 0) {
        toast({
          title: `部分完成 ${ok}/${platforms.length}`,
          description: "当前平台完成后才会打开下一个；未完成平台请先在 Chrome 里发布",
        })
      }
    } finally {
      setPublishingPlatform(null)
      setIsPublishing(false)
    }
  }

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform],
    )
  }

  const handleGenerate = async () => {
    const videoUrl = activeVideoUrl
    const finalTitle = title.trim()
    if (!videoUrl) {
      toast({ title: "请选择或输入视频", variant: "destructive" })
      return
    }
    if (!finalTitle) {
      toast({ title: "请填写发布标题", variant: "destructive" })
      return
    }

    setIsGenerating(true)
    setShareUrl("")
    setShareToken("")
    try {
      const res = await fetch("/api/share/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: toAbsoluteVideoUrl(videoUrl),
          title: finalTitle,
          description: description.trim(),
          tags: parseTags(tagsText),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : data.error ||
              data.detail?.message ||
              (res.status === 404
                ? "后端未启动或端口不对，请在项目目录运行：pnpm dev:api（默认 8002）"
                : "生成失败")
        throw new Error(msg)
      }
      const token = String(data.share_token || "")
      const localShareUrl =
        token && typeof window !== "undefined"
          ? `${window.location.origin}/api/share/${token}`
          : String(data.share_url || "")
      setShareUrl(localShareUrl)
      setShareToken(token)
      toast({ title: "分享链接已生成", description: "可复制链接或打开各平台发布" })
    } catch (e) {
      toast({
        title: "生成失败",
        description: e instanceof Error ? e.message : "请检查后端是否已启动",
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const copyPayload = [title.trim(), description.trim(), parseTags(tagsText).map((t) => `#${t}`).join(" ")]
    .filter(Boolean)
    .join("\n\n")

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-rose-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            一键<span className="text-rose-500 dark:text-rose-400">分发</span>
          </h1>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
            选择视频、填写文案，一键自动发布到已绑定的抖音、小红书等平台（Playwright 浏览器自动化）
          </p>
        </header>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* 左侧：视频库 */}
          <section className="lg:col-span-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">待分发视频</h2>
              <button
                type="button"
                onClick={handleImportFromHistory}
                className="text-[12px] font-medium text-rose-500 hover:text-rose-600"
              >
                从创作历史导入
              </button>
            </div>

            {videos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-slate-200 bg-white py-14 dark:border-white/10 dark:bg-white/5">
                <Film className="h-10 w-10 text-slate-300" />
                <p className="text-[14px] text-slate-500">暂无视频，可从下方上传本地文件或粘贴视频地址</p>
                <button
                  type="button"
                  onClick={handleImportFromHistory}
                  className="rounded-xl bg-rose-500 px-4 py-2 text-[13px] font-medium text-white hover:bg-rose-600"
                >
                  从历史记录导入
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {videos.map((video) => {
                  const thumb = video.thumbnail ? resolveMediaUrl(video.thumbnail) : null
                  const selected = selectedId === video.id
                  return (
                    <div
                      key={video.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleSelectVideo(video)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          handleSelectVideo(video)
                        }
                      }}
                      className={cn(
                        "group flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                        selected
                          ? "border-rose-300 bg-rose-50/50 dark:border-rose-500/30 dark:bg-rose-500/5"
                          : "border-slate-200/60 bg-white hover:border-rose-200 dark:border-white/10 dark:bg-white/5",
                      )}
                    >
                      <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb} alt="" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full items-center justify-center">
                            <Film className="h-5 w-5 text-slate-400" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                          {video.title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-400">
                          {SOURCE_LABELS[video.source]} · {formatTime(video.createdAt)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {selected && <Check className="h-4 w-4 text-rose-500" />}
                        <button
                          type="button"
                          title="删除"
                          aria-label={`删除 ${video.title}`}
                          onClick={(e) => handleRemoveVideo(video, e)}
                          className="rounded-lg p-1.5 text-slate-400 opacity-70 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100 dark:hover:bg-red-500/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
              <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">从本地选择视频</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.webm,.mkv,.avi,.m4v"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) void handleLocalVideoUpload(file)
                  e.target.value = ""
                }}
              />
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) void handleLocalVideoUpload(file)
                }}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 transition-colors",
                  isUploading
                    ? "border-rose-200 bg-rose-50/40 dark:border-rose-500/20"
                    : "border-slate-200 hover:border-rose-300 hover:bg-rose-50/30 dark:border-white/10 dark:hover:border-rose-500/30",
                )}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-6 w-6 animate-spin text-rose-500" />
                    <span className="text-[12px] text-slate-500">正在上传 {uploadLabel}…</span>
                  </>
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-rose-500" />
                    <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      点击选择或拖拽视频到此处
                    </span>
                    <span className="text-[11px] text-slate-400">支持 mp4 / mov / webm，最大 2GB</span>
                  </>
                )}
              </button>
              {uploadError ? (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-red-600">
                  <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {uploadError}
                </p>
              ) : null}
              {uploadSuccess ? (
                <p className="mt-2 flex items-start gap-1.5 text-[12px] text-emerald-600">
                  <CheckCircle2 className="mt-0.5 h-3.5 shrink-0" />
                  {uploadSuccess}
                </p>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
              <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">或粘贴视频地址</p>
              <div className="flex gap-2">
                <input
                  value={manualUrl}
                  onChange={(e) => {
                    setManualUrl(e.target.value)
                    setSelectedId(null)
                  }}
                  placeholder="https://... 或 /static/video-postprocess/..."
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] outline-none focus:border-rose-300 dark:border-white/10 dark:bg-white/5"
                />
                <button
                  type="button"
                  onClick={handleAddManualUrl}
                  className="shrink-0 rounded-xl bg-slate-800 px-3 py-2 text-[12px] font-medium text-white hover:bg-slate-900 dark:bg-slate-200 dark:text-slate-900"
                >
                  添加
                </button>
              </div>
            </div>
          </section>

          {/* 右侧：文案 + 生成 */}
          <section className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">作品描述</h2>
                  <span className="text-[11px] text-slate-400" title="对齐抖音创作者中心发布页">
                    同抖音发布页
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleAiFillCopy()}
                  disabled={isAiFilling}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-violet-600 disabled:opacity-60"
                >
                  {isAiFilling ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  AI 填文
                </button>
              </div>

              <div className="overflow-hidden rounded-xl border-2 border-rose-200/80 dark:border-rose-500/30">
                <div className="relative border-b border-slate-100 px-4 py-3 dark:border-white/10">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, DOUYIN_TITLE_MAX))}
                    placeholder="填写作品标题"
                    maxLength={DOUYIN_TITLE_MAX}
                    className="w-full bg-transparent pr-14 text-[14px] font-medium outline-none placeholder:text-slate-400"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">
                    {title.length}/{DOUYIN_TITLE_MAX}
                  </span>
                </div>

                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DOUYIN_DESC_MAX))}
                  placeholder="添加作品简介"
                  rows={5}
                  maxLength={DOUYIN_DESC_MAX}
                  className="w-full resize-none bg-transparent px-4 py-3 text-[13px] leading-relaxed outline-none placeholder:text-slate-400"
                />

                <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 dark:border-white/10">
                  <div className="flex items-center gap-3 text-[12px] text-slate-500">
                    <span className="text-rose-500">#添加话题</span>
                    <span className="text-slate-300">|</span>
                    <span>@好友</span>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    {description.length} / {DOUYIN_DESC_MAX}
                  </span>
                </div>
              </div>

              <input
                value={tagsText}
                onChange={(e) => setTagsText(e.target.value)}
                placeholder="话题标签，用逗号分隔（AI 填文会自动生成）"
                className="mt-3 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-[13px] outline-none focus:border-rose-300 dark:border-white/10 dark:bg-white/5"
              />

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-slate-400">推荐</span>
                {DOUYIN_SUGGESTED_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => appendTag(tag)}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
                  >
                    #{tag}
                  </button>
                ))}
              </div>

              {activeVideoUrl && (
                <p className="mt-3 truncate text-[11px] text-slate-400">
                  视频：{toAbsoluteVideoUrl(activeVideoUrl)}
                </p>
              )}

              <div className="mt-5 rounded-xl border border-slate-200/60 bg-slate-50/80 p-4 dark:border-white/10 dark:bg-white/5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">发布平台</h3>
                  <button
                    type="button"
                    onClick={() => void loadBoundAccounts()}
                    className="text-[11px] text-rose-500 hover:text-rose-600"
                  >
                    刷新绑定
                  </button>
                </div>
                {boundAccounts.length === 0 ? (
                  <div className="space-y-2">
                    <p className="text-[12px] text-slate-500">
                      全自动发布需要先绑定抖音 / 小红书 / 快手等账号（浏览器登录或粘贴 Cookie）。
                    </p>
                    {onNavigateToBinding ? (
                      <button
                        type="button"
                        onClick={onNavigateToBinding}
                        className="rounded-lg bg-rose-500 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-rose-600"
                      >
                        前往账号绑定 →
                      </button>
                    ) : (
                      <p className="text-[12px] text-rose-600">请在侧边栏打开「账号绑定」</p>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {boundAccounts.map((acc) => {
                      const meta = PLATFORM_META[acc.platform] || { name: acc.label, icon: "📱" }
                      const selected = selectedPlatforms.includes(acc.platform)
                      return (
                        <button
                          key={acc.platform}
                          type="button"
                          onClick={() => togglePlatform(acc.platform)}
                          className={cn(
                            "flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors",
                            selected
                              ? "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-300"
                              : "border-slate-200 bg-white text-slate-600 dark:border-white/10 dark:bg-white/5",
                          )}
                        >
                          <span>{meta.icon}</span>
                          {meta.name}
                          {acc.nickname ? (
                            <span className="text-[10px] opacity-70">@{acc.nickname}</span>
                          ) : null}
                          {selected ? <Check className="h-3.5 w-3.5" /> : null}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!canPublish) {
                    toast({
                      title: "暂时无法发布",
                      description: publishBlockedReason,
                      variant: "destructive",
                    })
                    if (publishBlockedReason.includes("账号绑定") && onNavigateToBinding) {
                      onNavigateToBinding()
                    }
                    return
                  }
                  void handleAutoPublish()
                }}
                disabled={isPublishing}
                className={cn(
                  "mt-5 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[15px] font-bold text-white shadow-lg transition-all",
                  canPublish
                    ? "bg-gradient-to-r from-rose-500 to-orange-500 shadow-rose-500/20 hover:scale-[1.01]"
                    : "cursor-not-allowed bg-slate-300 shadow-none dark:bg-slate-700",
                )}
              >
                {isPublishing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {publishingPlatform
                      ? `正在发布 ${PLATFORM_META[publishingPlatform]?.name || publishingPlatform}（${selectedPlatforms.indexOf(publishingPlatform) + 1}/${selectedPlatforms.length}）…`
                      : "准备发布…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    启动全网发布
                  </>
                )}
              </button>
              {isPublishing && publishingPlatform ? (
                <p className="mt-2 text-center text-[12px] text-slate-600 dark:text-slate-400">
                  一次只打开一个 Chrome 窗口；当前平台发布成功后才会进入下一平台。未完成请在此窗口操作，不要关闭。
                </p>
              ) : null}
              {publishBlockedReason && !isPublishing ? (
                <p className="mt-2 text-center text-[12px] text-amber-700 dark:text-amber-400">
                  {publishBlockedReason}
                </p>
              ) : null}

              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating || !activeVideoUrl || !title.trim()}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 text-[13px] font-medium text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-300"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    生成分享链接...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    备用：生成分享页（半自动）
                  </>
                )}
              </button>
            </div>

            {publishResults.length > 0 && (
              <div className="rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                <h3 className="mb-3 text-[15px] font-semibold text-slate-800 dark:text-slate-200">发布结果</h3>
                <div className="space-y-2">
                  {publishResults.map((r) => {
                    const meta = PLATFORM_META[r.platform] || { name: r.platform, icon: "📱" }
                    return (
                      <div
                        key={r.platform}
                        className={cn(
                          "flex items-start gap-3 rounded-xl border px-3 py-2.5 text-[13px]",
                          r.success
                            ? "border-emerald-200/60 bg-emerald-50/40 dark:border-emerald-500/20"
                            : "border-red-200/60 bg-red-50/40 dark:border-red-500/20",
                        )}
                      >
                        {r.success ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {meta.icon} {meta.name}
                          </p>
                          <p className="mt-0.5 text-[12px] text-slate-500">
                            {r.success
                              ? r.metadata?.message || "发布流程已执行"
                              : r.error || "发布失败"}
                          </p>
                          {r.url ? (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-600 hover:underline"
                            >
                              查看页面 <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {shareUrl && (
              <div className="rounded-2xl border border-emerald-200/60 bg-emerald-50/40 p-5 dark:border-emerald-500/20 dark:bg-emerald-500/5">
                <div className="mb-3 flex items-center gap-2">
                  <Check className="h-4 w-4 text-emerald-600" />
                  <h3 className="text-[15px] font-semibold text-emerald-800 dark:text-emerald-300">分享链接已就绪</h3>
                </div>
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200/60 bg-white px-3 py-2 dark:border-emerald-500/20 dark:bg-white/5">
                  <Link2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600 dark:text-slate-300">{shareUrl}</span>
                  <button
                    type="button"
                    onClick={() => copyText(shareUrl, "链接已复制")}
                    className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100"
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg p-1.5 text-emerald-600 hover:bg-emerald-100"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(copyPayload, "文案已复制")}
                    className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[12px] font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-500/20 dark:bg-white/5"
                  >
                    复制完整文案
                  </button>
                  {shareToken && (
                    <span className="self-center text-[11px] text-emerald-600/70">Token: {shareToken.slice(0, 8)}…</span>
                  )}
                </div>
              </div>
            )}

            <div className="flex items-start gap-2 rounded-xl border border-emerald-200/60 bg-emerald-50/50 p-3 text-[12px] text-emerald-800 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-300">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <p>
                全自动发布需先启动后端
                <code className="mx-1 rounded bg-emerald-100 px-1 dark:bg-emerald-500/10">pnpm dev:api</code>
                。点击「启动全网发布」会<strong className="font-medium">弹出 Chrome</strong>自动传视频、填标题，约 3–8 分钟。
                <strong className="font-medium">个人账号</strong>请用账号绑定的浏览器登录（开放平台 API 需企业主体）。
                若弹出<strong className="font-medium">手机验证</strong>，请完成验证并点「发布」，<strong className="font-medium">看到发布成功提示后</strong>浏览器会自动关闭；请勿提前关窗。
                若失败请到「账号绑定」重新登录抖音，并查看
                <code className="mx-1 rounded bg-emerald-100 px-1 dark:bg-emerald-500/10">data/temp/publish-debug</code>
                截图。
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
