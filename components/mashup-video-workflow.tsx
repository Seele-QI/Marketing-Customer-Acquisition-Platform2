"use client"

import * as React from "react"
import {
  Mic,
  Play,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Download,
  X,
  Upload,
  Shuffle,
  Video,
  Clock,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import {
  VideoWorkflowPage,
  WorkflowHero,
  WorkflowStepIndicator,
  UploadZone,
  buildClipSteps,
} from "@/components/video-workflow-shell"
import { submitMashup, cancelMashup } from "@/lib/video/api"
import { VideoClipOptions } from "@/components/video-clip-options"
import { VideoCoverSettings } from "@/components/video-cover-settings"
import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import { startCoverGeneration } from "@/lib/video/cover-runtime"
import { formatClipNetworkError } from "@/lib/mashup-video-task-runtime"
import { fileToBase64, resolveMediaUrl } from "@/lib/video/utils"
import type { MashupVideoResponse } from "@/lib/video/types"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import type { AssetRef } from "@/lib/workflow-draft-store"
import {
  clearDraft,
  defaultMashupDraft,
  loadDraft,
  saveDraft,
} from "@/lib/workflow-draft-store"
import {
  clearClipWorkflow,
  hydrateClipAudio,
  hydrateClipCoverImage,
  hydrateMashupVideos,
  mashupDraftFromState,
  persistClipAudio,
  persistClipImage,
  persistMashupCoverImage,
} from "@/lib/workflow-clip-persist"
import { deleteWorkflowAsset } from "@/lib/workflow-asset-store"

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const MIN_VIDEOS = 5
const ACCEPTED_VIDEO = "video/mp4,video/quicktime,video/webm,video/x-msvideo"
const ACCEPTED_AUDIO = "audio/mp3,audio/wav,audio/m4a,audio/ogg"
const MAX_VIDEO_SIZE = 100 * 1024 * 1024 // 100 MB per video
const MAX_AUDIO_SIZE = 20 * 1024 * 1024  // 20 MB audio sample

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type StepId = 1 | 2 | 3

type VideoItem = {
  id: string
  file: File
  name: string
  base64: string
  duration: number // seconds, from metadata or estimated
}

type AudioItem = {
  file: File
  name: string
  base64: string
}

type CoverImageItem = {
  id: string
  file: File
  previewUrl: string
  base64: string
}

type WorkflowState = {
  currentStep: StepId
  videos: VideoItem[]
  script: string
  audioSample: AudioItem | null
  enableBgm: boolean
  enableSubtitles: boolean
  isProcessing: boolean
  taskId: string
  stageLabel: string
  progress: number
  result: MashupVideoResponse | null
  errorMessage: string
  submittedAt: number
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

async function getVideoDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const video = document.createElement("video")
    video.preload = "metadata"
    video.onloadedmetadata = () => {
      window.URL.revokeObjectURL(video.src)
      resolve(video.duration)
    }
    video.onerror = () => resolve(0)
    video.src = URL.createObjectURL(file)
  })
}

let _idCounter = 0
function uid(): string {
  return `vid_${Date.now()}_${++_idCounter}`
}

/* ================================================================== */
/*  Step 1: Material Prep                                              */
/* ================================================================== */

function StepMaterialPrep({
  videos,
  script,
  audioSample,
  enableBgm,
  enableSubtitles,
  onVideosChange,
  onScriptChange,
  onAudioChange,
  onEnableBgmChange,
  onEnableSubtitlesChange,
  coverImage,
  onCoverImageChange,
  coverAspectRatio,
  coverResolution,
  onCoverAspectRatioChange,
  onCoverResolutionChange,
  onSubmit,
  isProcessing,
}: {
  videos: VideoItem[]
  script: string
  audioSample: AudioItem | null
  enableBgm: boolean
  enableSubtitles: boolean
  coverImage: CoverImageItem | null
  onCoverImageChange: (img: CoverImageItem | null) => void
  coverAspectRatio: CoverAspectRatio
  coverResolution: CoverResolution
  onCoverAspectRatioChange: (v: CoverAspectRatio) => void
  onCoverResolutionChange: (v: CoverResolution) => void
  onVideosChange: (vids: VideoItem[]) => void
  onScriptChange: (s: string) => void
  onAudioChange: (a: AudioItem | null) => void
  onEnableBgmChange: (v: boolean) => void
  onEnableSubtitlesChange: (v: boolean) => void
  onSubmit: () => void
  isProcessing: boolean
}) {
  const videoInputRef = React.useRef<HTMLInputElement>(null)
  const coverInputRef = React.useRef<HTMLInputElement>(null)

  const handleCoverImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "请上传图片文件", variant: "destructive" })
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast({ title: "封面参考图超过 10MB 限制", variant: "destructive" })
      return
    }
    const base64 = await fileToBase64(file)
    onCoverImageChange({
      id: `cover_${Date.now()}`,
      file,
      previewUrl: URL.createObjectURL(file),
      base64,
    })
  }

  const handleAddVideos = async (files: FileList | null) => {
    if (!files) return
    const newVideos: VideoItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith("video/")) continue
      if (file.size > MAX_VIDEO_SIZE) {
        toast({ title: `${file.name} 超过 100MB 限制，已跳过`, variant: "destructive" })
        continue
      }
      const [base64, duration] = await Promise.all([fileToBase64(file), getVideoDuration(file)])
      newVideos.push({ id: uid(), file, name: file.name, base64, duration })
    }
    onVideosChange([...videos, ...newVideos])
  }

  const removeVideo = (id: string) => {
    onVideosChange(videos.filter((v) => v.id !== id))
  }

  const shuffleVideos = () => {
    if (videos.length < 2) return
    const shuffled = [...videos]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    onVideosChange(shuffled)
  }

  const handleAudioFile = async (file: File) => {
    if (file.size > MAX_AUDIO_SIZE) {
      toast({ title: "音频文件超过 20MB 限制", variant: "destructive" })
      return
    }
    const base64 = await fileToBase64(file)
    onAudioChange({ file, name: file.name, base64 })
  }

  const canSubmit = videos.length >= MIN_VIDEOS && script.trim().length > 0 && audioSample !== null && !isProcessing

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-100 text-[11px] font-bold text-violet-600 dark:bg-violet-500/20 dark:text-violet-400">1</span>
        <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-200">素材准备</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                上传视频素材 <span className="text-violet-500">*</span>
                <span className="ml-2 text-[12px] font-normal text-slate-400">
                  至少 {MIN_VIDEOS} 段（已选 {videos.length} 段）
                </span>
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={shuffleVideos} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5">
                  <Shuffle className="h-3 w-3" />打乱
                </button>
                <button type="button" onClick={() => videoInputRef.current?.click()} className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-600 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-400">
                  <Upload className="h-3.5 w-3.5" />添加视频
                </button>
              </div>
              <input ref={videoInputRef} type="file" accept={ACCEPTED_VIDEO} multiple className="hidden" onChange={(e) => handleAddVideos(e.target.files)} />
            </div>

            {videos.length === 0 ? (
              <div className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 transition-all hover:border-slate-300 dark:border-white/10 dark:bg-white/5" onClick={() => videoInputRef.current?.click()}>
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
                  <Video className="h-6 w-6 text-violet-400" />
                </span>
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">点击上传视频（MP4 / MOV / WebM）</p>
                <p className="text-[11px] text-slate-400">每段不超过 100MB，至少 {MIN_VIDEOS} 段</p>
              </div>
            ) : (
              <div className="space-y-2">
                {videos.map((vid, idx) => (
                  <div key={vid.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-[12px] font-bold text-violet-500 dark:bg-violet-500/10">{idx + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">{vid.name}</p>
                      <p className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="h-3 w-3" />
                        {vid.duration > 0 ? `${vid.duration.toFixed(1)} 秒` : "时长未知"}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeVideo(vid.id)} className="rounded-lg p-1 text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => videoInputRef.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-[13px] text-slate-400 hover:border-violet-300 hover:text-violet-400">
                  <Upload className="h-4 w-4" />添加更多视频
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium text-slate-700 dark:text-slate-300">
              上传参考音色 <span className="text-violet-500">*</span>
            </p>
            {audioSample ? (
              <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
                  <Mic className="h-5 w-5 text-violet-400" />
                </span>
                <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">{audioSample.name}</p>
                <button type="button" onClick={() => onAudioChange(null)} className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] text-slate-500">更换</button>
              </div>
            ) : (
              <UploadZone accentColor="violet" accept={ACCEPTED_AUDIO} label="上传参考音色" icon={Mic} hint="MP3 / WAV / M4A" onFile={(f) => { void handleAudioFile(f) }} />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-500/10">
              <FileText className="h-4 w-4 text-violet-400" />
            </span>
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">口播文案</span>
            <span className="ml-auto text-[11px] text-slate-400">{script.length} 字</span>
          </div>
          <textarea
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder="输入文案全文，系统将按句号、感叹号、问号与换行自动断句…"
            className="min-h-[280px] flex-1 resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[13px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
          />
        </div>
      </div>

      <VideoClipOptions
        accent="violet"
        enableBgm={enableBgm}
        enableSubtitles={enableSubtitles}
        onEnableBgmChange={onEnableBgmChange}
        onEnableSubtitlesChange={onEnableSubtitlesChange}
      />

      <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
        <p className="text-[13px] font-medium text-violet-600 dark:text-violet-400">封面参考图</p>
        <p className="mt-1 text-[11px] text-slate-500">用于并行生成短视频封面；未上传则跳过封面生成</p>
        <div className="mt-3 flex items-center gap-3">
          {coverImage ? (
            <>
              <img
                src={coverImage.previewUrl}
                alt="封面参考"
                className="h-16 w-16 rounded-lg object-cover ring-1 ring-violet-200"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => onCoverImageChange(null)}>
                移除
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => coverInputRef.current?.click()}>
              <Upload className="mr-1.5 h-3.5 w-3.5" />
              上传参考图
            </Button>
          )}
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void handleCoverImage(file)
              e.target.value = ""
            }}
          />
        </div>
      </div>

      <VideoCoverSettings
        accent="violet"
        aspectRatio={coverAspectRatio}
        resolution={coverResolution}
        onAspectRatioChange={onCoverAspectRatioChange}
        onResolutionChange={onCoverResolutionChange}
      />

      <div className="flex flex-col items-center gap-2 pt-2">
        <Button size="lg" disabled={!canSubmit} onClick={onSubmit} className="min-w-[240px] rounded-full bg-violet-600 hover:bg-violet-700">
          {isProcessing ? (<><Loader2 className="mr-2 h-4 w-4 animate-spin" />处理中...</>) : (<><Play className="mr-2 h-4 w-4" />一键混剪视频</>)}
        </Button>
        {videos.length > 0 && videos.length < MIN_VIDEOS && (
          <p className="text-[12px] text-amber-500">还需上传至少 {MIN_VIDEOS - videos.length} 段视频素材</p>
        )}
      </div>
    </section>
  )
}

/* ================================================================== */
/*  Step 2: Audio Generation                                           */
/* ================================================================== */

function StepAudioGen({ stageLabel, progress }: { stageLabel: string; progress: number }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative mb-6">
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-violet-100 border-t-violet-500 dark:border-violet-500/20 dark:border-t-violet-400" />
        <Mic className="absolute inset-0 m-auto h-8 w-8 text-violet-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
        正在生成AI配音
      </h3>
      <p className="max-w-md text-center text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        {stageLabel || "正在通过 AI 引擎克隆您的音色并生成完整配音"}，预计需要 2~10 分钟...
      </p>
      {progress > 0 && (
        <p className="mt-3 text-[12px] text-slate-400">进度 {progress}%</p>
      )}
    </div>
  )
}

/* ================================================================== */
/*  Step 3: Video Result                                               */
/* ================================================================== */

function StepVideoResult({
  result,
  error,
  stageLabel,
  progress,
}: {
  result: MashupVideoResponse | null
  error: string
  stageLabel: string
  progress: number
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">混剪失败</h3>
        <p className="max-w-md text-center text-[13px] text-slate-500 dark:text-slate-400">{error}</p>
      </div>
    )
  }

  const videoSrc = result?.video_url ? resolveMediaUrl(result.video_url) : ""

  if (!result?.video_url) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-violet-400" />
        <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
          视频混剪中...
        </h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {stageLabel || "正在使用 ffmpeg 拼接视频片段、添加字幕、BGM 和转场效果"}
        </p>
        {progress > 0 && (
          <p className="mt-3 text-[12px] text-slate-400">进度 {progress}%</p>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center py-8">
      <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
      <h3 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
        混剪完成
      </h3>
      <div className="mb-6 w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video src={videoSrc} controls disablePictureInPicture className="w-full">
          您的浏览器不支持视频播放
        </video>
      </div>
      <a href={videoSrc} download={`video-${result.task_id || "mashup"}.mp4`} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="lg" className="rounded-full">
          <Download className="mr-2 h-4 w-4" />
          下载视频
        </Button>
      </a>
    </div>
  )
}

/* ================================================================== */
/*  Main Component                                                     */
/* ================================================================== */

export function MashupVideoWorkflow() {
  const runtimeApi = useTaskRuntimeApi()
  const runtimeTask = useRuntimeTask("mashup")
  const [hydrating, setHydrating] = React.useState(true)
  const [videoRefs, setVideoRefs] = React.useState<AssetRef[]>([])
  const [audioRef, setAudioRef] = React.useState<AssetRef | null>(null)
  const [coverImageRef, setCoverImageRef] = React.useState<AssetRef | null>(null)
  const [coverImage, setCoverImage] = React.useState<CoverImageItem | null>(null)
  const [coverAspectRatio, setCoverAspectRatio] = React.useState<CoverAspectRatio>(DEFAULT_COVER_ASPECT_RATIO)
  const [coverResolution, setCoverResolution] = React.useState<CoverResolution>(DEFAULT_COVER_RESOLUTION)
  const [state, setState] = React.useState<WorkflowState>({
    currentStep: 1,
    videos: [],
    script: "",
    audioSample: null,
    enableBgm: true,
    enableSubtitles: true,
    isProcessing: false,
    taskId: "",
    stageLabel: "",
    progress: 0,
    result: null,
    errorMessage: "",
    submittedAt: 0,
  })
  const toastedRef = React.useRef("")

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = loadDraft("mashup") ?? defaultMashupDraft()
      const videos = await hydrateMashupVideos(draft.videoRefs)
      const audioSample = await hydrateClipAudio(draft.audioRef)
      const coverImg = await hydrateClipCoverImage(draft.coverImageRef ?? null)
      if (cancelled) return
      setVideoRefs(draft.videoRefs)
      setAudioRef(draft.audioRef)
      setCoverImageRef(draft.coverImageRef ?? null)
      setCoverImage(coverImg)
      setCoverAspectRatio(draft.coverAspectRatio ?? DEFAULT_COVER_ASPECT_RATIO)
      setCoverResolution(draft.coverResolution ?? DEFAULT_COVER_RESOLUTION)
      setState({
        currentStep: draft.currentStep,
        videos,
        script: draft.script,
        audioSample,
        enableBgm: draft.enableBgm,
        enableSubtitles: draft.enableSubtitles,
        isProcessing: false,
        taskId: draft.taskId,
        stageLabel: draft.stageLabel,
        progress: draft.progress,
        result: null,
        errorMessage: draft.errorMessage,
        submittedAt: draft.submittedAt,
      })
      setHydrating(false)
    })()
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    if (hydrating) return
    saveDraft(
      "mashup",
      mashupDraftFromState({
        ...state,
        videoRefs,
        audioRef,
        coverImageRef,
        coverAspectRatio,
        coverResolution,
      }),
    )
  }, [state, videoRefs, audioRef, coverImageRef, coverAspectRatio, coverResolution, hydrating])

  const handleVideosChange = React.useCallback(async (videos: VideoItem[]) => {
    setState((s) => ({ ...s, videos }))
    const nextRefs: AssetRef[] = []
    for (const vid of videos) {
      const existing = videoRefs.find((r) => r.id === vid.id)
      if (existing) {
        nextRefs.push(existing)
        continue
      }
      const saved = await persistClipImage("mashup", vid.file, vid.base64, "")
      if (saved) {
        nextRefs.push(saved.ref)
        setState((s) => ({
          ...s,
          videos: s.videos.map((v) => (v.id === vid.id ? { ...v, id: saved.id } : v)),
        }))
      }
    }
    setVideoRefs(nextRefs)
    const removed = videoRefs.filter((r) => !nextRefs.some((n) => n.id === r.id))
    await Promise.all(removed.map((r) => deleteWorkflowAsset(r.id)))
  }, [videoRefs])

  const handleAudioChange = React.useCallback(async (a: AudioItem | null) => {
    setState((s) => ({ ...s, audioSample: a }))
    if (!a) {
      if (audioRef) await deleteWorkflowAsset(audioRef.id)
      setAudioRef(null)
      return
    }
    const saved = await persistClipAudio("mashup", a.file, a.base64)
    if (audioRef && audioRef.id !== saved?.id) {
      await deleteWorkflowAsset(audioRef.id)
    }
    if (saved) setAudioRef(saved.ref)
  }, [audioRef])

  const handleCoverImageChange = React.useCallback(async (img: CoverImageItem | null) => {
    setCoverImage(img)
    if (!img) {
      if (coverImageRef) await deleteWorkflowAsset(coverImageRef.id)
      setCoverImageRef(null)
      return
    }
    const saved = await persistMashupCoverImage(img.file, img.base64, img.previewUrl)
    if (coverImageRef && coverImageRef.id !== saved?.id) {
      await deleteWorkflowAsset(coverImageRef.id)
    }
    if (saved) {
      setCoverImageRef(saved.ref)
      setCoverImage((prev) => (prev ? { ...prev, id: saved.id } : prev))
    }
  }, [coverImageRef])

  React.useEffect(() => {
    if (!runtimeTask) return
    if (runtimeTask.status === "running") {
      setState((s) => ({
        ...s,
        currentStep: 2,
        isProcessing: true,
        taskId: runtimeTask.taskId,
        stageLabel: runtimeTask.stageLabel || s.stageLabel,
        progress: runtimeTask.progress,
        errorMessage: "",
      }))
      return
    }
    if (runtimeTask.status === "success") {
      const videoUrl = String(runtimeTask.result?.videoUrl ?? "")
      setState((s) => ({
        ...s,
        currentStep: 3,
        isProcessing: false,
        taskId: runtimeTask.taskId,
        stageLabel: runtimeTask.stageLabel || "完成",
        progress: 100,
        result: videoUrl
          ? { task_id: runtimeTask.taskId, status: "success", video_url: videoUrl }
          : s.result,
        errorMessage: "",
      }))
      if (toastedRef.current !== runtimeTask.taskId) {
        toastedRef.current = runtimeTask.taskId
        toast({ title: "视频混剪生成成功！" })
      }
      return
    }
    if (runtimeTask.status === "failed") {
      setState((s) => ({
        ...s,
        currentStep: 3,
        isProcessing: false,
        taskId: runtimeTask.taskId,
        stageLabel: runtimeTask.stageLabel || "失败",
        errorMessage: runtimeTask.error || "混剪失败",
      }))
      if (toastedRef.current !== `fail:${runtimeTask.taskId}`) {
        toastedRef.current = `fail:${runtimeTask.taskId}`
        toast({
          title: "混剪失败",
          description: runtimeTask.error || "混剪失败",
          variant: "destructive",
        })
      }
    }
  }, [runtimeTask])

  const handleCancel = async () => {
    if (!state.taskId) return
    try {
      await cancelMashup(state.taskId)
    } catch {
      // ignore
    }
    runtimeApi.markFailed("mashup", "已停止生成", { writeHistory: true })
    setState((s) => ({
      ...s,
      isProcessing: false,
      errorMessage: "已停止生成",
    }))
  }

  const handleSubmit = async () => {
    const { videos, script, audioSample } = state
    if (videos.length < MIN_VIDEOS || !script.trim() || !audioSample) return
    if (runtimeApi.isRunning("mashup")) {
      toast({
        title: "已有任务进行中",
        description: "请等待当前混剪完成，避免重复扣积分。",
        variant: "destructive",
      })
      return
    }

    setState((s) => ({
      ...s,
      currentStep: 2,
      isProcessing: true,
      errorMessage: "",
      taskId: "",
      stageLabel: "提交任务中",
      progress: 0,
      result: null,
      submittedAt: Date.now(),
    }))

    try {
      const req = {
        videos_base64: videos.map((v) => v.base64),
        audio_base64: audioSample.base64,
        script: script.trim(),
        enable_bgm: state.enableBgm,
        enable_subtitles: state.enableSubtitles,
        bgm_volume: state.enableBgm ? 0.32 : 0,
      }

      const queued = await submitMashup(req)
      const taskId = queued.task_id
      if (!taskId) throw new Error("未返回任务 ID")

      setState((s) => ({ ...s, taskId, stageLabel: "任务已入队" }))
      runtimeApi.register({
        kind: "mashup",
        taskId,
        progress: 5,
        stageLabel: "任务已入队",
        meta: { script: script.trim() },
      })
      if (coverImage) {
        startCoverGeneration({
          kind: "mashup",
          script: script.trim(),
          referenceImage: { base64: coverImage.base64, previewUrl: coverImage.previewUrl },
          aspectRatio: coverAspectRatio,
          resolution: coverResolution,
          linkedTaskId: taskId,
        })
      } else {
        toast({
          title: "未上传封面参考图",
          description: "视频将正常生成，本次跳过封面并行生成。",
        })
      }
    } catch (err: unknown) {
      const msg = formatClipNetworkError(err)
      setState((s) => ({
        ...s,
        currentStep: 3,
        isProcessing: false,
        errorMessage: msg,
      }))
      toast({ title: "混剪失败", description: msg, variant: "destructive" })
    }
  }

  const handleReset = async () => {
    await clearClipWorkflow("mashup")
    clearDraft("mashup")
    setVideoRefs([])
    setAudioRef(null)
    setState({
      currentStep: 1,
      videos: [],
      script: "",
      audioSample: null,
      enableBgm: true,
      enableSubtitles: true,
      isProcessing: false,
      taskId: "",
      stageLabel: "",
      progress: 0,
      result: null,
      errorMessage: "",
      submittedAt: 0,
    })
  }

  const handleBackToMaterials = () => {
    setState((s) => ({
      ...s,
      currentStep: 1,
      isProcessing: false,
      errorMessage: "",
      taskId: "",
      stageLabel: "",
      progress: 0,
      result: null,
    }))
  }

  const clipSteps = buildClipSteps(
    state.currentStep,
    state.isProcessing,
    !!state.result?.video_url,
    !!state.errorMessage,
  )

  return (
    <VideoWorkflowPage>
      <WorkflowHero
        accentColor="violet"
        title="AI"
        accentWord="视频混剪"
        description="上传多段视频素材、文案与参考音色，AI 生成配音后由 ffmpeg 混剪合成（字幕 + BGM + 转场）"
      />

      <div className="mb-6">
        <WorkflowStepIndicator accentColor="violet" steps={clipSteps} />
      </div>

      {state.currentStep === 1 && (
        <StepMaterialPrep
          videos={state.videos}
          script={state.script}
          audioSample={state.audioSample}
          enableBgm={state.enableBgm}
          enableSubtitles={state.enableSubtitles}
          onVideosChange={(vids) => { void handleVideosChange(vids) }}
          onScriptChange={(text) => setState((s) => ({ ...s, script: text }))}
          onAudioChange={(a) => { void handleAudioChange(a) }}
          onEnableBgmChange={(v) => setState((s) => ({ ...s, enableBgm: v }))}
          onEnableSubtitlesChange={(v) => setState((s) => ({ ...s, enableSubtitles: v }))}
          coverImage={coverImage}
          onCoverImageChange={(img) => { void handleCoverImageChange(img) }}
          coverAspectRatio={coverAspectRatio}
          coverResolution={coverResolution}
          onCoverAspectRatioChange={setCoverAspectRatio}
          onCoverResolutionChange={setCoverResolution}
          onSubmit={handleSubmit}
          isProcessing={state.isProcessing}
        />
      )}

      {state.currentStep === 2 && (
        <StepAudioGen stageLabel={state.stageLabel} progress={state.progress} />
      )}

      {state.currentStep === 3 && (
        <>
          <StepVideoResult
            result={state.result}
            error={state.errorMessage}
            stageLabel={state.stageLabel}
            progress={state.progress}
          />
          {!state.isProcessing && (
            <div className="flex justify-center gap-4 pt-4">
              {state.errorMessage ? (
                <Button variant="outline" onClick={handleBackToMaterials} className="rounded-full">
                  返回修改素材
                </Button>
              ) : null}
              <Button variant="outline" onClick={() => { void handleReset() }} className="rounded-full">
                重新创作
              </Button>
            </div>
          )}
          {state.isProcessing && state.taskId && (
            <div className="flex justify-center pt-4">
              <Button variant="outline" onClick={() => { void handleCancel() }} className="rounded-full">
                停止生成
              </Button>
            </div>
          )}
        </>
      )}
    </VideoWorkflowPage>
  )
}
