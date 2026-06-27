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
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { submitMashup, queryMashupStatus, cancelMashup } from "@/lib/video/api"
import {
  CLIP_POLL_INTERVAL_MS,
  POLL_ERROR_LIMIT,
  TASK_TIMEOUT_MS,
  formatClipNetworkError,
  mvStageToStep,
  isClipSuccess,
  isClipTerminal,
} from "@/lib/mashup-video-task-runtime"
import { fileToBase64 } from "@/lib/video/utils"
import type { MashupVideoResponse } from "@/lib/video/types"

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

type WorkflowState = {
  currentStep: StepId
  videos: VideoItem[]
  script: string
  audioSample: AudioItem | null
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
/*  Step Indicator                                                     */
/* ================================================================== */

const STEPS: { id: StepId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 1, label: "素材准备", icon: Video },
  { id: 2, label: "配音生成", icon: Mic },
  { id: 3, label: "混剪合成", icon: Play },
]

function StepIndicator({ current }: { current: StepId }) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {STEPS.map((step, i) => {
        const isDone = step.id < current
        const isActive = step.id === current
        const Icon = step.icon
        return (
          <React.Fragment key={step.id}>
            <div
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors",
                isDone && "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400",
                isActive && "bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400",
                !isDone && !isActive && "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-500",
              )}
            >
              {isDone ? <CheckCircle2 className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              <span className="hidden sm:inline">{step.label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  "h-px w-8",
                  step.id < current ? "bg-emerald-300 dark:bg-emerald-600" : "bg-slate-200 dark:bg-white/10",
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ================================================================== */
/*  Step 1: Material Prep                                              */
/* ================================================================== */

function StepMaterialPrep({
  videos,
  script,
  audioSample,
  onVideosChange,
  onScriptChange,
  onAudioChange,
  onSubmit,
  isProcessing,
}: {
  videos: VideoItem[]
  script: string
  audioSample: AudioItem | null
  onVideosChange: (vids: VideoItem[]) => void
  onScriptChange: (s: string) => void
  onAudioChange: (a: AudioItem | null) => void
  onSubmit: () => void
  isProcessing: boolean
}) {
  const videoInputRef = React.useRef<HTMLInputElement>(null)
  const audioInputRef = React.useRef<HTMLInputElement>(null)

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
    <div className="space-y-8">
      {/* --- 视频素材上传 --- */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            🎬 上传视频素材 <span className="text-violet-500">*</span>
            <span className="ml-2 text-[12px] font-normal text-slate-400">
              至少 {MIN_VIDEOS} 段（已选 {videos.length} 段）
            </span>
          </h3>
          <div className="flex gap-2">
            <button
              onClick={shuffleVideos}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
              title="随机打乱顺序"
            >
              <Shuffle className="h-3 w-3" />
              打乱
            </button>
            <button
              onClick={() => videoInputRef.current?.click()}
              className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-1.5 text-[12px] font-medium text-violet-600 hover:bg-violet-100 dark:bg-violet-500/10 dark:text-violet-400"
            >
              <Upload className="h-3.5 w-3.5" />
              添加视频
            </button>
          </div>
          <input
            ref={videoInputRef}
            type="file"
            accept={ACCEPTED_VIDEO}
            multiple
            className="hidden"
            onChange={(e) => handleAddVideos(e.target.files)}
          />
        </div>

        {videos.length === 0 ? (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 transition-all hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            onClick={() => videoInputRef.current?.click()}
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-500/10">
              <Video className="h-6 w-6 text-violet-400" />
            </span>
            <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
              点击或拖拽上传视频素材（支持 MP4 / MOV / WebM）
            </p>
            <p className="text-[11px] text-slate-400">每段不超过 100MB，时长 2~30 秒，至少 {MIN_VIDEOS} 段</p>
          </div>
        ) : (
          <div className="space-y-2">
            {videos.map((vid, idx) => (
              <div
                key={vid.id}
                className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 dark:border-white/10 dark:bg-white/5"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-[12px] font-bold text-violet-500 dark:bg-violet-500/10">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    {vid.name}
                  </p>
                  <p className="flex items-center gap-1 text-[11px] text-slate-400">
                    <Clock className="h-3 w-3" />
                    {vid.duration > 0 ? `${vid.duration.toFixed(1)} 秒` : "时长未知"}
                    {vid.duration > 5 && (
                      <span className="ml-1 rounded bg-amber-50 px-1 text-[10px] text-amber-600 dark:bg-amber-500/10">
                        将自动分段（≤5s）
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => removeVideo(vid.id)}
                  className="rounded-lg p-1 text-slate-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
            <button
              onClick={() => videoInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-3 text-[13px] text-slate-400 transition-colors hover:border-violet-300 hover:text-violet-400 dark:border-white/15 dark:hover:border-violet-500/30"
            >
              <Upload className="h-4 w-4" />
              添加更多视频
            </button>
          </div>
        )}
      </section>

      {/* --- 文案输入 --- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          📝 文案内容 <span className="text-violet-500">*</span>
          <span className="ml-2 text-[12px] font-normal text-slate-400">
            {script.length} 字（按 。！？换行断句）
          </span>
        </h3>
        <textarea
          value={script}
          onChange={(e) => onScriptChange(e.target.value)}
          placeholder="在此输入文案全文，系统将自动按句号、感叹号、问号、换行进行断句。每句话将匹配一个或多个视频片段。"
          rows={8}
          className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-violet-300 focus:outline-none focus:ring-2 focus:ring-violet-100 dark:border-white/10 dark:bg-white/5 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-violet-500/30 dark:focus:ring-violet-500/10"
        />
      </section>

      {/* --- 音色样本 --- */}
      <section>
        <h3 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
          🎙️ 上传个人音色 <span className="text-violet-500">*</span>
          <span className="ml-2 text-[12px] font-normal text-slate-400">
            10~30 秒录音，支持 MP3 / WAV / M4A
          </span>
        </h3>
        {audioSample ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3 dark:border-emerald-500/20 dark:bg-emerald-500/5">
            <Mic className="h-5 w-5 text-emerald-500" />
            <span className="flex-1 text-[13px] font-medium text-slate-700 dark:text-slate-300">
              {audioSample.name}
            </span>
            <button
              onClick={() => {
                onAudioChange(null)
                if (audioInputRef.current) audioInputRef.current.value = ""
              }}
              className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-6 transition-all hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
            onClick={() => audioInputRef.current?.click()}
          >
            <Mic className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-[13px] text-slate-500 dark:text-slate-400">点击上传音色样本</p>
          </div>
        )}
        <input
          ref={audioInputRef}
          type="file"
          accept={ACCEPTED_AUDIO}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) handleAudioFile(f)
          }}
        />
      </section>

      {/* --- 提交 --- */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="min-w-[240px] rounded-full bg-violet-600 hover:bg-violet-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              一键混剪视频
            </>
          )}
        </Button>
      </div>
      {videos.length > 0 && videos.length < MIN_VIDEOS && (
        <p className="text-center text-[12px] text-amber-500">
          还需上传至少 {MIN_VIDEOS - videos.length} 段视频素材
        </p>
      )}
    </div>
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
        <video
          src={result.video_url}
          controls
          className="w-full"
        >
          您的浏览器不支持视频播放
        </video>
      </div>
      <a href={result.video_url} download={`video-${result.task_id || "mashup"}.mp4`} target="_blank" rel="noopener noreferrer">
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
  const [state, setState] = React.useState<WorkflowState>({
    currentStep: 1,
    videos: [],
    script: "",
    audioSample: null,
    isProcessing: false,
    taskId: "",
    stageLabel: "",
    progress: 0,
    result: null,
    errorMessage: "",
    submittedAt: 0,
  })
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollErrorCountRef = React.useRef(0)

  React.useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [])

  const stopPolling = React.useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const handleCancel = async () => {
    if (!state.taskId) return
    stopPolling()
    try {
      await cancelMashup(state.taskId)
    } catch {
      // ignore
    }
    setState((s) => ({
      ...s,
      isProcessing: false,
      errorMessage: "已停止生成",
    }))
  }

  const handleSubmit = async () => {
    const { videos, script, audioSample } = state
    if (videos.length < MIN_VIDEOS || !script.trim() || !audioSample) return

    stopPolling()
    pollErrorCountRef.current = 0
    const submittedAt = Date.now()
    setState((s) => ({
      ...s,
      currentStep: 2,
      isProcessing: true,
      errorMessage: "",
      taskId: "",
      stageLabel: "提交任务中",
      progress: 0,
      result: null,
      submittedAt,
    }))

    try {
      const req = {
        videos_base64: videos.map((v) => v.base64),
        audio_base64: audioSample.base64,
        script: script.trim(),
        bgm_volume: 0.32,
      }

      const queued = await submitMashup(req)
      const taskId = queued.task_id
      if (!taskId) throw new Error("未返回任务 ID")

      setState((s) => ({ ...s, taskId, stageLabel: "任务已入队" }))

      const pollOnce = async () => {
        try {
          if (Date.now() - submittedAt > TASK_TIMEOUT_MS) {
            throw new Error("任务超时，请稍后重试")
          }
          const status = await queryMashupStatus(taskId)
          pollErrorCountRef.current = 0
          const step = mvStageToStep(status.stage || "", status.status)
          const stageLabel = status.stage_label || status.stage || ""

          if (isClipTerminal(status)) {
            if (isClipSuccess(status) && status.video_url) {
              const result: MashupVideoResponse = {
                task_id: taskId,
                status: "success",
                video_url: status.video_url,
                audio_url: status.audio_url,
              }
              setState((s) => ({
                ...s,
                currentStep: 3,
                isProcessing: false,
                result,
                errorMessage: "",
                stageLabel,
                progress: status.progress ?? 100,
              }))
              toast({ title: "视频混剪生成成功！" })
            } else {
              const err = status.error || "混剪失败"
              setState((s) => ({
                ...s,
                currentStep: 3,
                isProcessing: false,
                result: null,
                errorMessage: err,
                stageLabel,
                progress: status.progress ?? 0,
              }))
              toast({ title: "混剪失败", description: err, variant: "destructive" })
            }
            return
          }

          setState((s) => ({
            ...s,
            currentStep: step,
            stageLabel,
            progress: status.progress ?? s.progress,
          }))
          pollRef.current = setTimeout(() => { void pollOnce() }, CLIP_POLL_INTERVAL_MS)
        } catch (err: unknown) {
          pollErrorCountRef.current += 1
          if (pollErrorCountRef.current >= POLL_ERROR_LIMIT) {
            const msg = formatClipNetworkError(err)
            setState((s) => ({
              ...s,
              currentStep: 3,
              isProcessing: false,
              errorMessage: msg,
            }))
            toast({ title: "混剪失败", description: msg, variant: "destructive" })
            return
          }
          pollRef.current = setTimeout(() => { void pollOnce() }, CLIP_POLL_INTERVAL_MS)
        }
      }

      void pollOnce()
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

  const handleReset = () => {
    stopPolling()
    setState({
      currentStep: 1,
      videos: [],
      script: "",
      audioSample: null,
      isProcessing: false,
      taskId: "",
      stageLabel: "",
      progress: 0,
      result: null,
      errorMessage: "",
      submittedAt: 0,
    })
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          🎬 视频混剪
        </h2>
        <p className="mt-2 text-[14px] text-slate-500 dark:text-slate-400">
          上传多段视频素材 + 文案 + 音色 → AI 生成配音 → ffmpeg 混剪合成带字幕和BGM的视频
        </p>
      </div>

      <StepIndicator current={state.currentStep} />

      {state.currentStep === 1 && (
        <StepMaterialPrep
          videos={state.videos}
          script={state.script}
          audioSample={state.audioSample}
          onVideosChange={(vids) => setState((s) => ({ ...s, videos: vids }))}
          onScriptChange={(text) => setState((s) => ({ ...s, script: text }))}
          onAudioChange={(a) => setState((s) => ({ ...s, audioSample: a }))}
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
              <Button variant="outline" onClick={handleReset} className="rounded-full">
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
    </div>
  )
}
