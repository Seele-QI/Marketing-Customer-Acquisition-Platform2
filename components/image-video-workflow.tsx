"use client"

import * as React from "react"
import {
  Image as ImageIcon,
  Mic,
  FileText,
  Play,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Download,
  X,
  Upload,
  Shuffle,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { addHistoryRecord } from "@/components/video-history"
import {
  VideoWorkflowPage,
  WorkflowHero,
  WorkflowStepIndicator,
  UploadZone,
  buildClipSteps,
} from "@/components/video-workflow-shell"
import { submitImageToVideo, queryImageToVideoStatus, cancelImageToVideo } from "@/lib/video/api"
import {
  CLIP_POLL_INTERVAL_MS,
  POLL_ERROR_LIMIT,
  TASK_TIMEOUT_MS,
  formatClipNetworkError,
  ivStageToStep,
  isClipSuccess,
  isClipTerminal,
} from "@/lib/image-video-task-runtime"
import { fileToBase64, createImageThumbnail, resolveMediaUrl } from "@/lib/video/utils"
import type { ImageToVideoResponse } from "@/lib/video/types"

/* ================================================================== */
/*  Constants                                                          */
/* ================================================================== */

const MIN_IMAGES = 7
const ACCEPTED_IMAGES = "image/png,image/jpeg,image/webp"
const ACCEPTED_AUDIO = "audio/mp3,audio/wav,audio/m4a,audio/ogg"
const MAX_IMAGE_SIZE = 10 * 1024 * 1024  // 10 MB per image
const MAX_AUDIO_SIZE = 20 * 1024 * 1024  // 20 MB audio sample

/* ================================================================== */
/*  Types                                                              */
/* ================================================================== */

type StepId = 1 | 2 | 3

type ImageItem = {
  id: string
  file: File
  previewUrl: string
  base64: string
}

type AudioItem = {
  file: File
  name: string
  base64: string
}

type WorkflowState = {
  currentStep: StepId
  images: ImageItem[]
  script: string
  audioSample: AudioItem | null
  isProcessing: boolean
  taskId: string
  stageLabel: string
  progress: number
  result: ImageToVideoResponse | null
  errorMessage: string
  submittedAt: number
}

/* ================================================================== */
/*  Helpers                                                            */
/* ================================================================== */

let _idCounter = 0
function uid(): string {
  return `img_${Date.now()}_${++_idCounter}`
}

async function recordImageVideoHistory(
  taskId: string,
  script: string,
  videoUrl: string,
  status: "success" | "failed",
  firstImagePreview: string | undefined,
  errorMessage?: string,
) {
  let coverThumbnail: string | undefined
  if (firstImagePreview) {
    try {
      coverThumbnail = await createImageThumbnail(firstImagePreview)
    } catch {
      /* ignore */
    }
  }
  addHistoryRecord({
    id: taskId,
    createdAt: Date.now(),
    script: script.trim(),
    videoUrl: videoUrl || "",
    coverUrl: "",
    coverThumbnail,
    source: "image-video",
    status,
    errorMessage,
  })
}

/* ================================================================== */
/*  Step 1: Material Prep                                              */
/* ================================================================== */

function StepMaterialPrep({
  images,
  script,
  audioSample,
  onImagesChange,
  onScriptChange,
  onAudioChange,
  onSubmit,
  isProcessing,
}: {
  images: ImageItem[]
  script: string
  audioSample: AudioItem | null
  onImagesChange: (imgs: ImageItem[]) => void
  onScriptChange: (s: string) => void
  onAudioChange: (a: AudioItem | null) => void
  onSubmit: () => void
  isProcessing: boolean
}) {
  const imageInputRef = React.useRef<HTMLInputElement>(null)

  const handleAddImages = async (files: FileList | null) => {
    if (!files) return
    const newImages: ImageItem[] = []
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (!file.type.startsWith("image/")) continue
      if (file.size > MAX_IMAGE_SIZE) {
        toast({ title: `${file.name} 超过 10MB 限制，已跳过`, variant: "destructive" })
        continue
      }
      const base64 = await fileToBase64(file)
      newImages.push({
        id: uid(),
        file,
        previewUrl: URL.createObjectURL(file),
        base64,
      })
    }
    onImagesChange([...images, ...newImages])
  }

  const removeImage = (id: string) => {
    const filtered = images.filter((img) => img.id !== id)
    onImagesChange(filtered)
  }

  const shuffleImages = () => {
    if (images.length < 2) return
    const shuffled = [...images]
    // Fisher-Yates
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    onImagesChange(shuffled)
  }

  const handleAudioFile = async (file: File) => {
    if (file.size > MAX_AUDIO_SIZE) {
      toast({ title: "音频文件超过 20MB 限制", variant: "destructive" })
      return
    }
    const base64 = await fileToBase64(file)
    onAudioChange({ file, name: file.name, base64 })
  }

  const canSubmit = images.length >= MIN_IMAGES && script.trim().length > 0 && audioSample !== null && !isProcessing

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-bold text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">1</span>
        <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-200">素材准备</h2>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                上传图片 <span className="text-emerald-500">*</span>
                <span className="ml-2 text-[12px] font-normal text-slate-400">
                  至少 {MIN_IMAGES} 张（已选 {images.length} 张）
                </span>
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={shuffleImages}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5"
                  title="随机打乱顺序"
                >
                  <Shuffle className="h-3 w-3" />
                  打乱
                </button>
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-medium text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:text-emerald-400"
                >
                  <Upload className="h-3.5 w-3.5" />
                  添加图片
                </button>
              </div>
              <input
                ref={imageInputRef}
                type="file"
                accept={ACCEPTED_IMAGES}
                multiple
                className="hidden"
                onChange={(e) => handleAddImages(e.target.files)}
              />
            </div>

            {images.length === 0 ? (
              <div
                className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-white p-10 transition-all hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20"
                onClick={() => imageInputRef.current?.click()}
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                  <ImageIcon className="h-6 w-6 text-emerald-400" />
                </span>
                <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
                  点击或拖拽上传图片（JPG / PNG / WebP）
                </p>
                <p className="text-[11px] text-slate-400">每张不超过 10MB，至少 {MIN_IMAGES} 张</p>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5"
                  >
                    <img src={img.previewUrl} alt={`图片 ${idx + 1}`} className="h-full w-full object-cover" />
                    <span className="absolute left-1.5 top-1.5 rounded-md bg-black/50 px-1.5 py-0.5 text-[10px] text-white">
                      {idx + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeImage(img.id)}
                      className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-red-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex aspect-[3/4] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-slate-300 text-slate-400 transition-colors hover:border-emerald-300 hover:text-emerald-400 dark:border-white/15"
                >
                  <Upload className="h-5 w-5" />
                  <span className="text-[11px]">添加</span>
                </button>
              </div>
            )}
          </div>

          <div>
            <p className="mb-3 text-[13px] font-medium text-slate-700 dark:text-slate-300">
              上传参考音色 <span className="text-emerald-500">*</span>
              <span className="ml-2 text-[12px] font-normal text-slate-400">10~30 秒 · MP3 / WAV / M4A</span>
            </p>
            {audioSample ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-500/10">
                    <Mic className="h-5 w-5 text-emerald-400" />
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    {audioSample.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onAudioChange(null)}
                    className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:bg-white/5"
                  >
                    更换
                  </button>
                </div>
              </div>
            ) : (
              <UploadZone
                accentColor="emerald"
                accept={ACCEPTED_AUDIO}
                label="上传参考音色"
                icon={Mic}
                hint="MP3 / WAV / M4A"
                onFile={(f) => { void handleAudioFile(f) }}
              />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
              <FileText className="h-4 w-4 text-emerald-400" />
            </span>
            <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">口播文案</span>
            <span className="ml-auto text-[11px] text-slate-400">{script.length} 字</span>
          </div>
          <textarea
            value={script}
            onChange={(e) => onScriptChange(e.target.value)}
            placeholder="输入文案全文，系统将按句号、感叹号、问号与换行自动断句…"
            className="min-h-[280px] flex-1 resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[13px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
          />
        </div>
      </div>

      <div className="flex flex-col items-center gap-2 pt-2">
        <Button
          size="lg"
          disabled={!canSubmit}
          onClick={onSubmit}
          className="min-w-[240px] rounded-full bg-emerald-600 hover:bg-emerald-700"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              处理中...
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" />
              一键生成图文视频
            </>
          )}
        </Button>
        {images.length > 0 && images.length < MIN_IMAGES && (
          <p className="text-[12px] text-amber-500">还需上传至少 {MIN_IMAGES - images.length} 张图片</p>
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
        <div className="h-20 w-20 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-500 dark:border-emerald-500/20 dark:border-t-emerald-400" />
        <Mic className="absolute inset-0 m-auto h-8 w-8 text-emerald-400" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
        正在生成AI配音
      </h3>
      <p className="max-w-md text-center text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
        {stageLabel || "正在通过 AI 引擎克隆您的音色并生成完整配音"}，预计需要 2~10 分钟，请耐心等待...
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
  result: ImageToVideoResponse | null
  error: string
  stageLabel: string
  progress: number
}) {
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <AlertCircle className="mb-4 h-12 w-12 text-red-400" />
        <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">生成失败</h3>
        <p className="max-w-md text-center text-[13px] text-slate-500 dark:text-slate-400">{error}</p>
      </div>
    )
  }

  const videoSrc = result?.video_url ? resolveMediaUrl(result.video_url) : ""

  if (!result?.video_url) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <Loader2 className="mb-4 h-12 w-12 animate-spin text-emerald-400" />
        <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
          视频合成中...
        </h3>
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {stageLabel || "正在使用 ffmpeg 合成图片、字幕、BGM 和转场效果"}
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
        视频生成完成
      </h3>
      <div className="mb-6 w-full max-w-sm overflow-hidden rounded-2xl bg-black">
        <video
          src={videoSrc}
          controls
          className="w-full"
        >
          您的浏览器不支持视频播放
        </video>
      </div>
      <a
        href={videoSrc}
        download={`video-${result.task_id || "image-to-video"}.mp4`}
        target="_blank"
        rel="noopener noreferrer"
      >
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

export function ImageVideoWorkflow() {
  const [state, setState] = React.useState<WorkflowState>({
    currentStep: 1,
    images: [],
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
      await cancelImageToVideo(state.taskId)
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
    const { images, script, audioSample } = state
    if (images.length < MIN_IMAGES || !script.trim() || !audioSample) return

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
        images_base64: images.map((img) => img.base64),
        audio_base64: audioSample.base64,
        script: script.trim(),
        bgm_volume: 0.32,
      }

      const queued = await submitImageToVideo(req)
      const taskId = queued.task_id
      if (!taskId) throw new Error("未返回任务 ID")

      setState((s) => ({ ...s, taskId, stageLabel: "任务已入队" }))

      const pollOnce = async () => {
        try {
          if (Date.now() - submittedAt > TASK_TIMEOUT_MS) {
            throw new Error("任务超时，请稍后重试")
          }
          const status = await queryImageToVideoStatus(taskId)
          pollErrorCountRef.current = 0
          const step = ivStageToStep(status.stage || "", status.status)
          const stageLabel = status.stage_label || status.stage || ""

          if (isClipTerminal(status)) {
            const firstPreview = images[0]?.previewUrl
            if (isClipSuccess(status) && status.video_url) {
              const result: ImageToVideoResponse = {
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
              void recordImageVideoHistory(taskId, script.trim(), status.video_url, "success", firstPreview)
              toast({ title: "图文视频生成成功！" })
            } else {
              const err = status.error || "生成失败"
              setState((s) => ({
                ...s,
                currentStep: 3,
                isProcessing: false,
                result: null,
                errorMessage: err,
                stageLabel,
                progress: status.progress ?? 0,
              }))
              void recordImageVideoHistory(taskId, script.trim(), "", "failed", firstPreview, err)
              toast({ title: "生成失败", description: err, variant: "destructive" })
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
            toast({ title: "生成失败", description: msg, variant: "destructive" })
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
      toast({ title: "生成失败", description: msg, variant: "destructive" })
    }
  }

  const handleReset = () => {
    stopPolling()
    setState({
      currentStep: 1,
      images: [],
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

  const clipSteps = buildClipSteps(
    state.currentStep,
    state.isProcessing,
    !!state.result?.video_url,
    !!state.errorMessage,
  )

  return (
    <VideoWorkflowPage>
      <WorkflowHero
        accentColor="emerald"
        title="AI"
        accentWord="图文视频"
        description="上传图片、文案与参考音色，AI 自动完成配音克隆与 ffmpeg 合成（字幕 + BGM + 转场）"
      />

      <div className="mb-6">
        <WorkflowStepIndicator accentColor="emerald" steps={clipSteps} />
      </div>

      {state.currentStep === 1 && (
        <StepMaterialPrep
          images={state.images}
          script={state.script}
          audioSample={state.audioSample}
          onImagesChange={(imgs) => setState((s) => ({ ...s, images: imgs }))}
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
    </VideoWorkflowPage>
  )
}
