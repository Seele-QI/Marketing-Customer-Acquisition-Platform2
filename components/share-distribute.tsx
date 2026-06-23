"use client"

import * as React from "react"
import QRCode from "qrcode"
import { Share2, Upload, Copy, Download, Check, Loader2, Link, QrCode, FileText, Tag, Film, Plus, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { loadShareVideos, type ShareVideo } from "@/components/video-history"
import { getFastapiBase } from "@/lib/fastapi-base"

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100MB

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ShareDistribute() {
  const [selectedVideo, setSelectedVideo] = React.useState<ShareVideo | null>(null)
  const [videos, setVideos] = React.useState<ShareVideo[]>([])
  const [title, setTitle] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [tagInput, setTagInput] = React.useState("")
  const [tags, setTags] = React.useState<string[]>([])
  const [qrDataUrl, setQrDataUrl] = React.useState("")
  const [shareUrl, setShareUrl] = React.useState("")
  const [isGenerating, setIsGenerating] = React.useState(false)
  const [isAiFilling, setIsAiFilling] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const manualObjectUrlsRef = React.useRef<string[]>([])

  const canGenerate = Boolean(selectedVideo && title.trim())

  React.useEffect(() => { setVideos(loadShareVideos()) }, [])
  React.useEffect(() => {
    return () => {
      for (const url of manualObjectUrlsRef.current) URL.revokeObjectURL(url)
      manualObjectUrlsRef.current = []
    }
  }, [])

  const handleSelectVideo = (v: ShareVideo) => {
    setSelectedVideo(v)
    setTitle(v.title)
  }

  const handleManualUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "文件过大", description: "最大支持 100MB", variant: "destructive" })
      return
    }
    const url = URL.createObjectURL(file)
    manualObjectUrlsRef.current.push(url)
    const video: ShareVideo = {
      id: `manual-${Date.now()}`,
      title: file.name.replace(/\.[^.]+$/, ""),
      url,
      source: "manual",
      createdAt: Date.now(),
    }
    setVideos((prev) => [video, ...prev])
    setSelectedVideo(video)
    setTitle(video.title)
    toast({ title: "上传成功", description: file.name })
    e.target.value = ""
  }

  const handleAiFill = async () => {
    if (!selectedVideo || isAiFilling) return
    const base = getFastapiBase()
    if (!base) {
      toast({ title: "缺少后端配置", description: "请配置 NEXT_PUBLIC_FASTAPI_URL", variant: "destructive" })
      return
    }
    setIsAiFilling(true)
    try {
      const prompt = `请根据以下视频信息，生成抖音视频的标题、文案描述和标签。视频文件名/主题：${selectedVideo.title}。请严格按以下JSON格式回复（不要其他内容）：\n{"title":"优化的标题(30字内)","description":"吸引人的视频文案","tags":["标签1","标签2","标签3"]}`
      const res = await fetch(`${base}/api/agent/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      })
      const data = await readJsonSafely(res)
      if (!res.ok) {
        const detail = typeof (data as { detail?: unknown } | null)?.detail === "string" ? (data as { detail: string }).detail : "AI 请求失败"
        throw new Error(detail)
      }
      const reply = typeof (data as { reply?: unknown } | null)?.reply === "string" ? (data as { reply: string }).reply : ""
      const parsed = parseAiShareMeta(reply)
      if (parsed.title) setTitle(parsed.title.slice(0, 30))
      if (parsed.description) setDescription(parsed.description)
      if (parsed.tags.length > 0) setTags(parsed.tags.slice(0, 5))
      toast({ title: "AI 自动填写完成" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "请稍后重试"
      toast({
        title: "AI 填写失败",
        description: `${msg}。可手动填写后继续生成分享链接。`,
        variant: "destructive",
      })
    } finally {
      setIsAiFilling(false)
    }
  }

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && tagInput.trim()) {
      e.preventDefault()
      const t = tagInput.trim()
      if (!tags.includes(t) && tags.length < 5) {
        setTags([...tags, t])
      }
      setTagInput("")
    }
  }

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t))

  const handleGenerate = async () => {
    if (!selectedVideo || !title.trim()) return
    const base = getFastapiBase()
    if (!base) {
      toast({ title: "缺少后端配置", description: "请配置 NEXT_PUBLIC_FASTAPI_URL", variant: "destructive" })
      return
    }
    setIsGenerating(true)
    try {
      const res = await fetch(`${base}/api/share/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoUrl: selectedVideo.url,
          title: title.trim(),
          description: description.trim(),
          tags,
        }),
      })
      const data = await readJsonSafely(res)
      if (!res.ok) {
        const detail = typeof (data as { detail?: unknown } | null)?.detail === "string" ? (data as { detail: string }).detail : "生成失败"
        throw new Error(detail)
      }
      const shareUrlValue =
        typeof (data as { share_url?: unknown } | null)?.share_url === "string" ? (data as { share_url: string }).share_url.trim() : ""
      if (!shareUrlValue) throw new Error("生成失败：后端未返回 share_url")

      // Generate QR code client-side from share URL
      const qr = await QRCode.toDataURL(shareUrlValue, {
        width: 256,
        margin: 2,
        color: { dark: "#1e293b", light: "#ffffff" },
      })
      setQrDataUrl(qr)
      setShareUrl(shareUrlValue)
    } catch (e) {
      toast({ title: "生成失败", description: e instanceof Error ? e.message : "请重试", variant: "destructive" })
    } finally {
      setIsGenerating(false)
    }
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast({ title: "已复制", description: "分享链接已复制到剪贴板" })
    } catch {
      toast({ title: "复制失败", variant: "destructive" })
    }
  }

  const handleDownloadQR = () => {
    const a = document.createElement("a")
    a.href = qrDataUrl
    a.download = `share-${Date.now()}.png`
    a.click()
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Header */}
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-sky-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            一键<span className="text-sky-500 dark:text-sky-400">分发</span>
          </h1>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
            选择视频 → 填写信息 → 生成二维码 → 手机扫码打开落地页 → 复制文案并跳转抖音创作者中心
          </p>
        </header>

        {/* Step 1: Select Video */}
        <section className="mb-6">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">1</span>
            <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">选择视频</h2>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {videos.map((v) => (
              <button
                key={v.id}
                onClick={() => handleSelectVideo(v)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all",
                  selectedVideo?.id === v.id
                    ? "border-sky-400/60 bg-sky-50/50 shadow-sm dark:border-sky-500/40 dark:bg-sky-500/10"
                    : "border-slate-200/60 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
                )}
              >
                <div className="flex h-16 w-full items-center justify-center rounded-xl bg-slate-100 dark:bg-white/5">
                  <Film className="h-8 w-8 text-slate-300" />
                </div>
                <p className="line-clamp-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">{v.title}</p>
                <p className="text-[10px] text-slate-400">{v.source === "manual" ? "手动上传" : v.source === "batch-edit" ? "批量混剪" : "视频创作"}</p>
              </button>
            ))}
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white/50 p-4 transition-all hover:border-sky-300 dark:border-white/10 dark:bg-white/5">
              <Plus className="h-6 w-6 text-slate-300" />
              <p className="text-[12px] text-slate-400">上传新视频</p>
              <input type="file" accept="video/*" className="hidden" onChange={handleManualUpload} />
            </label>
          </div>
        </section>

        {/* Step 2: Fill Info */}
        {selectedVideo && (
          <section className="mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">2</span>
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">填写信息</h2>
            </div>
            <div className="space-y-3 rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-[12px] font-medium text-slate-500">标题 (30字以内)</label>
                  <button
                    onClick={handleAiFill}
                    disabled={isAiFilling}
                    className="inline-flex items-center gap-1 rounded-lg bg-purple-50 px-2.5 py-1 text-[11px] font-medium text-purple-600 transition-all hover:bg-purple-100 disabled:opacity-50 dark:bg-purple-500/10 dark:text-purple-400"
                  >
                    {isAiFilling ? (
                      <><Loader2 className="h-3 w-3 animate-spin" />AI 生成中</>
                    ) : (
                      <><Sparkles className="h-3 w-3" />AI 自动填写</>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  maxLength={30}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 text-[13px] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
                  placeholder="输入视频标题..."
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-500">文案描述</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 text-[13px] focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
                  placeholder="输入视频文案描述..."
                />
              </div>
              <div>
                <label className="mb-1 block text-[12px] font-medium text-slate-500">标签 (回车添加，最多5个)</label>
                <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 dark:border-white/5 dark:bg-white/5">
                  {tags.map((t) => (
                    <span key={t} className="inline-flex items-center gap-0.5 rounded-lg bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-500/20 dark:text-sky-400">
                      #{t}
                      <button onClick={() => removeTag(t)} className="ml-0.5 text-sky-400 hover:text-sky-600">×</button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={handleAddTag}
                    className="min-w-[80px] flex-1 bg-transparent text-[13px] focus:outline-none dark:text-slate-200"
                    placeholder={tags.length < 5 ? "输入标签后回车..." : ""}
                    disabled={tags.length >= 5}
                  />
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Step 3: Generate QR */}
        {selectedVideo && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-100 text-[11px] font-bold text-sky-600 dark:bg-sky-500/20 dark:text-sky-400">3</span>
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">生成二维码</h2>
            </div>

            {!qrDataUrl ? (
              <div className="flex justify-center">
                <button
                  onClick={handleGenerate}
                  disabled={!canGenerate || isGenerating}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-bold shadow-lg transition-all",
                    canGenerate && !isGenerating
                      ? "bg-gradient-to-r from-sky-500 to-cyan-500 text-white shadow-sky-500/25 hover:from-sky-600 hover:to-cyan-600 active:scale-[0.97]"
                      : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600",
                  )}
                >
                  {isGenerating ? (
                    <><Loader2 className="h-5 w-5 animate-spin" />生成中…</>
                  ) : (
                    <><QrCode className="h-5 w-5" />生成二维码</>
                  )}
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200/60 bg-white p-6 dark:border-white/10 dark:bg-white/5">
                <img src={qrDataUrl} alt="分享二维码" className="h-48 w-48 rounded-xl border" />
                <p className="text-center text-[13px] text-slate-500 dark:text-slate-400">
                  扫描二维码 → 一键跳转抖音创作者中心
                </p>

                <div className="flex w-full max-w-md items-center gap-2 rounded-xl border border-slate-200/60 bg-slate-50/50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                  <Link className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-slate-600 dark:text-slate-400">{shareUrl}</span>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCopyLink}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/60 bg-white px-4 py-2 text-[12px] font-medium text-slate-600 transition-all hover:border-slate-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied ? "已复制" : "复制链接"}
                  </button>
                  <button
                    onClick={handleDownloadQR}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-sky-500 px-4 py-2 text-[12px] font-medium text-white transition-all hover:bg-sky-600"
                  >
                    <Download className="h-3.5 w-3.5" />
                    下载二维码
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  )
}

async function readJsonSafely(res: Response): Promise<unknown | null> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

function parseAiShareMeta(reply: string): { title: string; description: string; tags: string[] } {
  const jsonMatch = reply.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error("AI 返回内容中未找到 JSON，请重试或手动填写")

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonMatch[0])
  } catch {
    throw new Error("AI 返回的 JSON 无法解析，请重试或手动填写")
  }

  if (!isRecord(parsed)) throw new Error("AI 返回的 JSON 结构异常（应为对象），请重试或手动填写")

  const title = typeof parsed.title === "string" ? parsed.title : ""
  const description = typeof parsed.description === "string" ? parsed.description : ""
  const tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t) => typeof t === "string") : []

  if (!title && !description && tags.length === 0) {
    throw new Error("AI 返回的 JSON 字段类型不正确，请重试或手动填写")
  }

  return { title, description, tags }
}
