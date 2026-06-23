"use client"

import * as React from "react"
import { Upload, X, Play, Shuffle, Layers, Film, CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { addShareVideo, addHistoryRecord, type ShareVideo } from "@/components/video-history"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ClipItem = { id: string; name: string; previewUrl: string; file: File }

/* ------------------------------------------------------------------ */
/*  Permutation helper                                                  */
/* ------------------------------------------------------------------ */

function generatePermutations<T>(arr: T[], maxCount = 20): T[][] {
  if (arr.length <= 1) return [arr]
  const results: T[][] = []
  function permute(prefix: T[], remaining: T[]) {
    if (results.length >= maxCount) return
    if (remaining.length === 0) {
      results.push(prefix)
      return
    }
    for (let i = 0; i < remaining.length; i++) {
      const next = remaining.slice(0, i).concat(remaining.slice(i + 1))
      permute([...prefix, remaining[i]], next)
      if (results.length >= maxCount) return
    }
  }
  permute([], arr)
  return results
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

const ACCEPTED_FILES = "video/*,image/*"
const MAX_CLIPS = 10
const MAX_SIZE = 100 * 1024 * 1024 // 100MB

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url)
}

export function BatchEdit() {
  const [clips, setClips] = React.useState<ClipItem[]>([])
  const [isProcessing, setIsProcessing] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [results, setResults] = React.useState<ShareVideo[]>([])
  const clipsRef = React.useRef<ClipItem[]>([])

  const permCount = clips.length >= 2 ? Math.min(factorial(clips.length), 20) : 0
  
  React.useEffect(() => {
    clipsRef.current = clips
  }, [clips])

  React.useEffect(() => {
    return () => {
      for (const c of clipsRef.current) URL.revokeObjectURL(c.previewUrl)
      clipsRef.current = []
    }
  }, [])

  const handleAddFiles = (files: FileList | null) => {
    if (!files) return
    const newClips: ClipItem[] = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      if (clips.length + newClips.length >= MAX_CLIPS) {
        toast({ title: `最多上传 ${MAX_CLIPS} 个素材`, variant: "destructive" })
        break
      }
      if (f.size > MAX_SIZE) {
        toast({ title: `${f.name} 超过 100MB`, variant: "destructive" })
        continue
      }
      newClips.push({
        id: `clip-${Date.now()}-${i}`,
        name: f.name,
        previewUrl: URL.createObjectURL(f),
        file: f,
      })
    }
    setClips((prev) => [...prev, ...newClips])
  }

  const removeClip = (id: string) => {
    const removed = clips.find((c) => c.id === id)
    if (removed) URL.revokeObjectURL(removed.previewUrl)
    setClips((prev) => prev.filter((c) => c.id !== id))
    setResults([])
  }

  const clearAllClips = () => {
    for (const c of clips) URL.revokeObjectURL(c.previewUrl)
    setClips([])
    setResults([])
  }

  const handleBatchEdit = async () => {
    if (clips.length < 2) {
      toast({ title: "至少需要 2 个素材才能混剪" })
      return
    }
    setIsProcessing(true)
    setResults([])
    setProgress(0)

    const perms = generatePermutations(clips, 20)
    const total = perms.length
    const newVideos: ShareVideo[] = []

    for (let i = 0; i < total; i++) {
      const order = perms[i]
      const titles = order.map((c, j) => `片段${j + 1}`).join("→")
      const video: ShareVideo = {
        id: `batch-${Date.now()}-${i}`,
        title: `混剪·${titles}`,
        url: order[0].previewUrl,
        thumbnail: order[0].previewUrl,
        source: "batch-edit",
        createdAt: Date.now(),
      }
      if (isHttpUrl(video.url)) {
        const safeThumb = video.thumbnail && isHttpUrl(video.thumbnail) ? video.thumbnail : undefined
        addShareVideo({ ...video, thumbnail: safeThumb })
        addHistoryRecord({
          id: video.id,
          createdAt: Date.now(),
          script: `[批量混剪] ${titles}`,
          videoUrl: video.url,
          coverUrl: safeThumb || "",
          gender: "female",
          status: "success",
        })
      }
      newVideos.push(video)
      setProgress(Math.round(((i + 1) / total) * 100))
      await new Promise((r) => setTimeout(r, 200)) // simulate processing
    }

    setResults(newVideos)
    setIsProcessing(false)
    toast({ title: "混剪完成", description: `已生成 ${total} 个混剪视频` })
  }

  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-4xl px-5 py-8 sm:px-8 sm:py-10">
        {/* Header */}
        <header className="mb-8">
          <div className="mb-4 h-1 w-12 rounded-full bg-violet-500/60" />
          <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
            批量<span className="text-violet-500 dark:text-violet-400">混剪</span>
          </h1>
          <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
            上传多个视频/图片素材 → 系统自动编号排列组合 → 一键生成多条混剪视频
          </p>
        </header>

        {/* Upload Zone */}
        <section className="mb-6">
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 transition-all",
              "border-violet-200 bg-white hover:border-violet-400 hover:bg-violet-50/30 dark:border-white/10 dark:bg-white/5 dark:hover:border-violet-500/40",
            )}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); handleAddFiles(e.dataTransfer.files) }}
          >
            <Upload className="h-10 w-10 text-violet-400" />
            <p className="text-[14px] font-medium text-slate-600 dark:text-slate-300">拖拽素材到此处，或点击上传</p>
            <p className="text-[12px] text-slate-400">支持视频/图片 · 单个最大 100MB · 最多 {MAX_CLIPS} 个</p>
            <input
              type="file"
              accept={ACCEPTED_FILES}
              multiple
              className="hidden"
              onChange={(e) => handleAddFiles(e.target.files)}
            />
          </label>
        </section>

        {/* Clip List */}
        {clips.length > 0 && (
          <section className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">
                素材列表 ({clips.length})
              </h2>
              <button onClick={clearAllClips} className="text-[12px] text-slate-400 hover:text-rose-500">清空全部</button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
              {clips.map((c, i) => (
                <div key={c.id} className="group relative overflow-hidden rounded-xl border border-slate-200/60 bg-white dark:border-white/10 dark:bg-white/5">
                  {c.file.type.startsWith("video/") ? (
                    <video src={c.previewUrl} className="aspect-square w-full object-cover" />
                  ) : (
                    <img src={c.previewUrl} alt="" className="aspect-square w-full object-cover" />
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                    <p className="truncate text-[10px] text-white">素材-{String(i + 1).padStart(2, "0")}</p>
                  </div>
                  <button
                    onClick={() => removeClip(c.id)}
                    className="absolute right-1 top-1 rounded-full bg-black/40 p-0.5 text-white opacity-0 transition-opacity hover:bg-rose-500 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Action */}
        {clips.length >= 2 && (
          <section className="mb-6">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-violet-200/60 bg-violet-50/30 p-5 dark:border-violet-500/20 dark:bg-violet-500/5">
              <div className="flex items-center gap-2 text-[14px] font-medium text-violet-700 dark:text-violet-300">
                <Shuffle className="h-4 w-4" />
                将生成 {permCount} 种排列组合，每种应用随机剪辑预设
              </div>
              {isProcessing ? (
                <div className="flex w-full max-w-xs flex-col items-center gap-2">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100 dark:bg-violet-500/20">
                    <div className="h-full rounded-full bg-violet-500 transition-all duration-300" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-[12px] text-violet-600 dark:text-violet-400">{progress}%</span>
                </div>
              ) : (
                <button
                  onClick={handleBatchEdit}
                  disabled={isProcessing}
                  className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-violet-500 to-purple-500 px-8 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-violet-500/25 transition-all hover:from-violet-600 hover:to-purple-600 active:scale-[0.97]"
                >
                  <Play className="h-5 w-5" />
                  开始混剪
                </button>
              )}
            </div>
          </section>
        )}

        {/* Results */}
        {results.length > 0 && (
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <h2 className="text-[15px] font-semibold text-slate-800 dark:text-slate-200">混剪完成 · {results.length} 个视频</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {results.map((v) => (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border border-slate-200/60 bg-white p-3 dark:border-white/10 dark:bg-white/5">
                  <Film className="h-8 w-8 shrink-0 text-violet-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">{v.title}</p>
                    <p className="text-[11px] text-slate-400">已生成，可在下方查看</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function factorial(n: number): number {
  let r = 1; for (let i = 2; i <= n; i++) r *= i; return r
}
