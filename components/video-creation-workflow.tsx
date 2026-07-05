"use client"

import * as React from "react"
import {
  Image as ImageIcon,
  Mic,
  FileText,
  Play,
  Clapperboard,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
  RefreshCw,
  Download,
  Square,
  ChevronLeft,
  Wand2,
  X,
  ImagePlus,
  Music,
  Captions,
} from "lucide-react"
import { VideoClipOptions } from "@/components/video-clip-options"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { toast } from "@/hooks/use-toast"
import { addHistoryRecord } from "@/components/video-history"
import {
  loadTask,
  saveTask,
  createNewTask,
  calcOverallProgress,
  estimateVoiceCloneProgress,
  getTaskStoreErrorMessage,
  isMaterialsLost,
  type VideoTaskState,
} from "@/lib/video-task-store"
import {
  createGenerateSubmissionPatch,
  deriveWorkflowUi,
  getTaskHealth,
  getTaskHealthMessage,
  RESUME_POLL_GRACE_MS,
  type WorkflowStepId as StepId,
  type WorkflowStepStatus as StepStatus,
} from "@/lib/video-task-runtime"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import { resolveMediaUrl, createImageThumbnail } from "@/lib/video/utils"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import {
  VideoWorkflowPage,
  WorkflowHero,
  WorkflowStepIndicator,
  UploadZone,
} from "@/components/video-workflow-shell"
import { EditingStylePanel } from "@/components/video/editing-style-panel"
import {
  getEditingPreset,
  resolveEditingPresetId,
  type EditingPresetId,
} from "@/lib/video/editing-presets"
import { startAutoSubtitle, queryAutoSubtitleStatus } from "@/lib/video/api"
import type { AutoSubtitleResponse } from "@/lib/video/api"
import { getCoverUiState } from "@/lib/video-cover-ui"
import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_MODE_LABELS,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
  type VideoPromptMode,
} from "@/lib/video/video-prompt-presets"

const VIDEO_FETCH: RequestInit = { credentials: "include" }

type UploadedImage = {
  file: File
  previewUrl: string
  base64: string
}

type UploadedAudio = {
  file: File
  name: string
  duration: string
  base64: string
}

type SlideImage = {
  file: File
  previewUrl: string
  base64: string
}

type Props = {
  /** 从其他板块跳转时预填的文案（如从文案创作或身份定位跳转） */
  initialScript?: string
}

type CardInfo = {
  text: string
  placeholder: string
}

type EditTaskResponse = {
  edit_job_id: string
  task_id?: string
  status: string
  progress?: number
  preset?: string
  source?: string
  output_video_url?: string
  error?: string
}

type ManualUploadResponse = {
  upload_id: string
  file_url?: string
  original_name?: string
  size?: number
}

function parseSegmentProgress(sd: Record<string, unknown>): {
  segmentCount: number
  segmentsCompleted: number | null
} {
  const segmentCount =
    typeof sd.segment_count === "number"
      ? sd.segment_count
      : typeof sd.segmentCount === "number"
        ? sd.segmentCount
        : 0
  const segmentsCompleted =
    typeof sd.segments_completed === "number"
      ? sd.segments_completed
      : typeof sd.segmentsCompleted === "number"
        ? sd.segmentsCompleted
        : null
  return { segmentCount, segmentsCompleted }
}

function stageProgressForVideoOutcome(postStage: string, postProgress: number) {
  if (postStage === "published") {
    return { voiceClone: 100, videoGen: 100, editing: 100 }
  }
  if (postStage === "running") {
    return { voiceClone: 100, videoGen: 100, editing: Math.max(10, postProgress) }
  }
  return { voiceClone: 100, videoGen: 100, editing: 0 }
}

type ManualEditResponse = {
  task_id: string
  status: string
  post_video_url?: string
  post_stage?: string
  post_progress?: number
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const ACCEPTED_IMAGES = ".jpg,.jpeg,.png,.webp,.bmp,.gif"
const ACCEPTED_AUDIO = ".mp3,.wav,.m4a,.ogg"
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const r = reader.result as string
      const idx = r.indexOf(",")
      resolve(idx >= 0 ? r.slice(idx + 1) : r)
    }
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"))
    reader.readAsDataURL(file)
  })
}

function normalizeCoverStatus(value: unknown): VideoTaskState["coverStatus"] {
  return value === "running" || value === "success" || value === "failed" ? value : "idle"
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function VideoCreationWorkflow({ initialScript }: Props) {
  const runtimeApi = useTaskRuntimeApi()
  const runtimeTask = useRuntimeTask("digital-human")

  // Persisted task state — survives tab switch, browser refresh, browser close.
  // Initialised from localStorage on mount; updated on every change.
  const [taskState, setTaskState] = React.useState<VideoTaskState>(() => {
    const saved: VideoTaskState | null = loadTask()
    if (saved) {
      // 兼容旧版：若 progress 是单数字，升级到分段结构
      if (typeof (saved as any).stageProgress !== "object") {
        saved.stageProgress = { voiceClone: 0, videoGen: 0, editing: 0 }
        saved.currentStage = "idle"
        saved.lastHeartbeat = 0
      }
      return saved
    }
    const initial = createNewTask()
    initial.script = initialScript ?? ""
    return initial
  })

  // 检测用户刷新页面但素材已丢失：localStorage 只剩 audioName/脚本，但没有 taskId、没在生成中
  // 这种情况要给一个明确的"请重新上传素材"提示
  const [materialsLost, setMaterialsLost] = React.useState(() => {
    if (typeof window === "undefined") return false
    const saved = loadTask()
    return isMaterialsLost(saved)
  })

  const [storageWarningMessage, setStorageWarningMessage] = React.useState("")
  // 临时未持久化的状态
  const [image, setImage] = React.useState<UploadedImage | null>(null)
  const [audio, setAudio] = React.useState<UploadedAudio | null>(null)
  const [manualVideoFile, setManualVideoFile] = React.useState<File | null>(null)
  const [manualVideoPreview, setManualVideoPreview] = React.useState("")
  const [manualUploadBusy, setManualUploadBusy] = React.useState(false)
  const [coverRetryBusy, setCoverRetryBusy] = React.useState(false)
  const [segmentCount, setSegmentCount] = React.useState(0)
  const [segmentsCompleted, setSegmentsCompleted] = React.useState(0)
  const [manualUploadId, setManualUploadId] = React.useState("")
  const [businessCardText, setBusinessCardText] = React.useState(taskState.businessCardText || "")
  const [slideImages, setSlideImages] = React.useState<SlideImage[]>([])
  const pollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const pollSessionRef = React.useRef(0)
  const pollInFlightRef = React.useRef(false)
  const editPollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const editPollSessionRef = React.useRef(0)
  const editPollInFlightRef = React.useRef(false)
  const skipNextHealthCheckRef = React.useRef(false)
  const storageWarningKeyRef = React.useRef("")
  const taskIdRef = React.useRef(taskState.taskId)
  const coverWaitStartRef = React.useRef(0)
  taskIdRef.current = taskState.taskId
  const taskStateRef = React.useRef(taskState)
  taskStateRef.current = taskState
  const handleTaskStoreResult = React.useCallback((result: ReturnType<typeof saveTask>) => {
    if (result.ok) {
      storageWarningKeyRef.current = ""
      setStorageWarningMessage("")
      return
    }

    const message = getTaskStoreErrorMessage(result.errorKind)
    setStorageWarningMessage(message)

    if (storageWarningKeyRef.current === result.errorKind) {
      return
    }

    storageWarningKeyRef.current = result.errorKind
    toast({
      title: result.errorKind === "quota-exceeded" ? "本地存储空间不足" : "本地草稿保存失败",
      description: message,
      variant: "destructive",
    })
  }, [])

  // Convenience setters — keep call sites short, persist transparently
  const updateTask = React.useCallback((patch: Partial<VideoTaskState>) => {
    const nextState = { ...taskStateRef.current, ...patch }
    taskStateRef.current = nextState
    taskIdRef.current = nextState.taskId
    setTaskState(nextState)
    handleTaskStoreResult(saveTask(nextState))
  }, [handleTaskStoreResult])

  // Legacy aliases for source-level readability
  const taskId = taskState.taskId
  const script = taskState.script
  const gender = taskState.gender
  const status = taskState.status
  const videoUrl = taskState.videoUrl
  const coverUrl = taskState.coverUrl
  const coverStatus = taskState.coverStatus
  const coverError = taskState.coverError
  const coverTaskId = taskState.coverTaskId
  const isProcessing = taskState.isProcessing
  const errorMessage = taskState.errorMessage
  const editingErrorMessage = taskState.editingErrorMessage
  const selectedPreset = resolveEditingPresetId(taskState.editingPreset)
  const setSelectedPreset = (id: EditingPresetId) =>
    updateTask({ editingPreset: resolveEditingPresetId(id) })
  const enableBgm = taskState.enableBgm !== false
  const enableSubtitles = taskState.enableSubtitles !== false
  const setEnableBgm = (v: boolean) => updateTask({ enableBgm: v })
  const setEnableSubtitles = (v: boolean) => updateTask({ enableSubtitles: v })
  const isEditing = taskState.isEditing
  const stageProgress = taskState.stageProgress
  const currentStage = taskState.currentStage
  const setScript = (v: string) => updateTask({ script: v })
  const setGender = (v: "male" | "female") => updateTask({ gender: v })
  const setVideoUrl = (v: string) => updateTask({ videoUrl: v })
  const setBusinessCardTextState = (v: string) => { setBusinessCardText(v); updateTask({ businessCardText: v }) }
  const setIsEditing = (v: boolean) => updateTask({ isEditing: v })
  const videoPrompt = taskState.videoPrompt
  const videoPromptMode = taskState.videoPromptMode
  const setVideoPrompt = (v: string) => updateTask({ videoPrompt: v })
  const setVideoPromptMode = (v: VideoPromptMode) => updateTask({ videoPromptMode: v })
  const applyVideoPromptPreset = React.useCallback((mode: VideoPromptMode) => {
    updateTask({
      videoPromptMode: mode,
      videoPrompt: VIDEO_PROMPT_PRESETS[mode],
    })
  }, [updateTask])

  const scriptRef = React.useRef(taskState.script)
  scriptRef.current = script
  const genderRef = React.useRef(gender)
  genderRef.current = gender
  const workflowUi = React.useMemo(() => deriveWorkflowUi(taskState), [taskState])
  const coverUi = React.useMemo(() => getCoverUiState({
    coverUrl,
    coverStatus,
    coverError,
    videoStatus: status,
  }), [coverError, coverStatus, coverUrl, status])

  React.useEffect(() => {
    return () => {
      if (manualVideoPreview) URL.revokeObjectURL(manualVideoPreview)
      slideImages.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    }
  }, [manualVideoPreview, slideImages])

  // ── 自动字幕生成 ──────────────────────────────────────────────
  const [autoSubtitleBusy, setAutoSubtitleBusy] = React.useState(false)
  const [autoSubtitlePath, setAutoSubtitlePath] = React.useState("")
  const [autoSubtitleText, setAutoSubtitleText] = React.useState("")
  const autoSubtitlePollRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoSubtitleSessionRef = React.useRef(0)
  const autoSubtitleInFlightRef = React.useRef(false)

  const stopAutoSubtitlePoll = React.useCallback(() => {
    autoSubtitleSessionRef.current += 1
    autoSubtitleInFlightRef.current = false
    if (autoSubtitlePollRef.current) {
      clearTimeout(autoSubtitlePollRef.current)
      autoSubtitlePollRef.current = null
    }
  }, [])

  React.useEffect(() => {
    return () => { stopAutoSubtitlePoll() }
  }, [stopAutoSubtitlePoll])

  const startAutoSubtitlePoll = React.useCallback((subtitleTaskId: string) => {
    stopAutoSubtitlePoll()
    const sessionId = autoSubtitleSessionRef.current

    const pollOnce = async () => {
      if (autoSubtitleInFlightRef.current || autoSubtitleSessionRef.current !== sessionId) return

      autoSubtitleInFlightRef.current = true
      let scheduleNext = true

      try {
        const status = await queryAutoSubtitleStatus(subtitleTaskId)
        if (autoSubtitleSessionRef.current !== sessionId) return

        if (status.status === "completed") {
          scheduleNext = false
          stopAutoSubtitlePoll()
          setAutoSubtitleBusy(false)
          setAutoSubtitlePath(status.subtitle_path || "")
          // 仅预览校对后文案，不覆盖用户提交的口播稿
          setAutoSubtitleText(status.subtitle_text || "")
          updateTask({
            autoSubtitleRunning: false,
            autoSubtitleTaskId: "",
          })
          toast({
            title: "字幕校对完成",
            description: `已按原文案断句生成 ${status.sentence_count ?? 0} 条字幕时间轴`,
          })
        } else if (status.status === "failed") {
          scheduleNext = false
          stopAutoSubtitlePoll()
          setAutoSubtitleBusy(false)
          updateTask({
            autoSubtitleRunning: false,
            autoSubtitleTaskId: "",
          })
          toast({ title: "字幕校对失败", description: status.error || "未知错误", variant: "destructive" })
        }
        // else: still processing, continue polling
      } catch {
        if (autoSubtitleSessionRef.current !== sessionId) return
        // Network errors are transient — keep polling
      } finally {
        autoSubtitleInFlightRef.current = false
        if (scheduleNext && autoSubtitleSessionRef.current === sessionId) {
          autoSubtitlePollRef.current = setTimeout(() => { void pollOnce() }, 2000)
        }
      }
    }

    void pollOnce()
  }, [stopAutoSubtitlePoll, updateTask])

  const handleAutoSubtitle = React.useCallback(async () => {
    // 确定当前视频来源
    const videoUrl2 = manualUploadId
      ? void 0
      : (videoUrl || manualVideoPreview)
    if (!videoUrl2 && !manualUploadId) {
      toast({ title: "无可用视频", description: "请先生成或上传视频", variant: "destructive" })
      return
    }

    setAutoSubtitleBusy(true)
    setAutoSubtitlePath("")
    setAutoSubtitleText("")

    try {
      // 提交自动字幕任务（传入原文案做校对对齐）
      const submitRes = await startAutoSubtitle({
        source: manualUploadId || manualVideoPreview ? "local" : "url",
        ...(manualUploadId || manualVideoPreview
          ? {}
          : { video_url: videoUrl2! }),
        subtitle_format: "ass",
        script: scriptRef.current.trim(),
      })

      // 持久化任务 ID 并启动后台轮询（跨界面切换后可恢复）
      updateTask({
        autoSubtitleTaskId: submitRes.task_id,
        autoSubtitleRunning: true,
      })
      startAutoSubtitlePoll(submitRes.task_id)
    } catch (e) {
      setAutoSubtitleBusy(false)
      updateTask({
        autoSubtitleRunning: false,
        autoSubtitleTaskId: "",
      })
      toast({
        title: "字幕校对失败",
        description: e instanceof Error ? e.message : "提交任务失败",
        variant: "destructive",
      })
    }
  }, [videoUrl, manualUploadId, manualVideoPreview, startAutoSubtitlePoll, updateTask])

  const handleManualVideoUpload = React.useCallback(async (file: File) => {
    if (!file.type.startsWith("video/")) {
      toast({ title: "文件类型不支持", description: "请选择 mp4 / mov / webm 等视频文件", variant: "destructive" })
      return
    }
    setManualVideoFile(file)
    const preview = URL.createObjectURL(file)
    setManualVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return preview
    })
    try {
      setManualUploadBusy(true)
      const formData = new FormData()
      formData.append("file", file)
      const uploadResp = await fetch("/api/video/manual-upload", {
        ...VIDEO_FETCH,
        method: "POST",
        body: formData,
      })
      const uploadData = (await uploadResp.json()) as ManualUploadResponse & { detail?: unknown }
      if (!uploadResp.ok || !uploadData.upload_id) {
        throw new Error(parseApiErrorResponse(uploadResp.status, uploadData, "手动上传失败"))
      }
      setManualUploadId(uploadData.upload_id)
      toast({ title: "视频上传成功", description: "已保存到后端，可继续应用剪辑效果" })
    } catch (error) {
      toast({ title: "手动上传后处理失败", description: error instanceof Error ? error.message : "请检查后端服务与视频格式", variant: "destructive" })
    } finally {
      setManualUploadBusy(false)
    }
  }, [setVideoUrl, toast, updateTask])

  const imagePreviewSrc = image?.previewUrl || taskState.imagePreview
  const imagePreviewRef = React.useRef(imagePreviewSrc)
  imagePreviewRef.current = imagePreviewSrc
  const editableVideoUrl = videoUrl || manualVideoPreview
  React.useEffect(() => { updateTask({ businessCardText }) }, [businessCardText, updateTask])
  const cardInfo: CardInfo = React.useMemo(() => ({
    text: businessCardText,
    placeholder: "例如：张三｜短视频运营｜专注本地生活获客",
  }), [businessCardText])
  const manualVideoUrl = React.useMemo(() => manualVideoPreview, [manualVideoPreview])
  const manualUploadLabel = manualVideoFile ? `${manualVideoFile.name} · ${formatSize(manualVideoFile.size)}` : "未选择视频文件"
  const activeStep = workflowUi.activeStep
  const stepStatuses = workflowUi.stepStatuses
  const readableTaskErrorMessage = errorMessage || getTaskHealthMessage(taskState)
  const submittedAtLabel = taskState.submittedAt
    ? new Date(taskState.submittedAt).toLocaleString("zh-CN", { hour12: false })
    : ""
  const lastStatusAtLabel = taskState.lastStatusAt
    ? new Date(taskState.lastStatusAt).toLocaleString("zh-CN", { hour12: false })
    : "暂未同步到任务状态"
  const imageBase64 = image?.base64 || taskState.imageBase64
  const audioBase64 = audio?.base64 || taskState.audioBase64
  const audioName = audio?.name || taskState.audioName
  const audioDuration = audio?.duration || taskState.audioDuration
  const hasImage = !!(imagePreviewSrc && imageBase64)
  const hasAudio = !!audioBase64
  const localPreviewImageSrc = imagePreviewSrc
  const isLocalPreviewMode =
    !videoUrl &&
    !!localPreviewImageSrc &&
    currentStage === "done" &&
    !taskState.taskId &&
    !taskState.isProcessing

  // Reset script when initialScript changes (from cross-navigation)
  React.useEffect(() => {
    if (initialScript) setScript(initialScript)
  }, [initialScript])

  React.useEffect(() => {
    return () => {
      if (image?.previewUrl) URL.revokeObjectURL(image.previewUrl)
    }
  }, [image?.previewUrl])

  const canGenerate = !!(hasImage && hasAudio && script.trim())

  const handleImageFile = React.useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "文件过大", description: "图片最大支持 50MB", variant: "destructive" })
      return
    }
    try {
      const base64 = await fileToBase64(file)
      const previewUrl = URL.createObjectURL(file)
      setImage({ file, previewUrl, base64 })
      updateTask({
        imageBase64: base64,
        imagePreview: `data:${file.type || "image/png"};base64,${base64}`,
      })
      setMaterialsLost(false)
    } catch {
      toast({ title: "读取失败", description: "无法读取图片文件", variant: "destructive" })
    }
  }, [updateTask])

  const handleAudioFile = React.useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "文件过大", description: "音频最大支持 50MB", variant: "destructive" })
      return
    }
    try {
      const base64 = await fileToBase64(file)
      // Mock duration — in real implementation, read actual duration
      const duration = "0:32"
      setAudio({ file, name: file.name, duration, base64 })
      updateTask({
        audioBase64: base64,
        audioName: file.name,
        audioDuration: duration,
      })
      setMaterialsLost(false)
    } catch {
      toast({ title: "读取失败", description: "无法读取音频文件", variant: "destructive" })
    }
  }, [updateTask])

  const handleSlideImageFile = React.useCallback(async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      toast({ title: "图片过大", description: `最大支持 ${formatSize(MAX_FILE_SIZE)}`, variant: "destructive" })
      return
    }
    try {
      const previewUrl = URL.createObjectURL(file)
      const base64 = await fileToBase64(file)
      setSlideImages((prev) => {
        const next = [...prev, { file, previewUrl, base64 }]
        updateTask({ slideImageCount: next.length })
        return next
      })
    } catch {
      toast({ title: "读取失败", description: "无法读取图片文件", variant: "destructive" })
    }
  }, [updateTask])

  const removeSlideImage = React.useCallback((index: number) => {
    setSlideImages((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl)
      const next = prev.filter((_, i) => i !== index)
      updateTask({ slideImageCount: next.length })
      return next
    })
  }, [updateTask])

  const stopBackgroundPoll = React.useCallback(() => {
    pollSessionRef.current += 1
    pollInFlightRef.current = false
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const stopEditPoll = React.useCallback(() => {
    editPollSessionRef.current += 1
    editPollInFlightRef.current = false
    if (editPollRef.current) {
      clearTimeout(editPollRef.current)
      editPollRef.current = null
    }
  }, [])

  const persistDigitalHumanHistory = React.useCallback(
    (record: {
      id: string
      createdAt: number
      script: string
      videoUrl: string
      coverUrl: string
      gender: "male" | "female"
      status: "success" | "failed"
      errorMessage?: string
    }) => {
      void (async () => {
        let coverThumbnail: string | undefined
        if (!record.coverUrl && imagePreviewRef.current) {
          try {
            coverThumbnail = await createImageThumbnail(imagePreviewRef.current)
          } catch {
            /* ignore thumbnail errors */
          }
        }
        addHistoryRecord({
          ...record,
          source: "digital-human",
          coverThumbnail,
        })
      })()
    },
    [],
  )

  const failTask = React.useCallback((message: string, options?: { taskId?: string; recordHistory?: boolean }) => {
    stopBackgroundPoll()
    stopEditPoll()
    stopAutoSubtitlePoll()
    const failedTaskId = options?.taskId ?? taskIdRef.current
    updateTask({
      status: "failed",
      currentStage: "failed",
      isProcessing: false,
      errorMessage: message,
      editingErrorMessage: "",
      resumeGraceUntil: 0,
    })
    const rt = runtimeApi.getTask("digital-human")
    if (rt?.status === "running" && (!failedTaskId || rt.taskId === failedTaskId)) {
      runtimeApi.markFailed("digital-human", message, {
        writeHistory: options?.recordHistory !== false,
      })
    } else if (options?.recordHistory && failedTaskId) {
      persistDigitalHumanHistory({
        id: failedTaskId,
        createdAt: Date.now(),
        script: scriptRef.current.trim(),
        videoUrl: "",
        coverUrl: "",
        gender: genderRef.current,
        status: "failed",
        errorMessage: message,
      })
    }
  }, [stopBackgroundPoll, stopEditPoll, stopAutoSubtitlePoll, updateTask, persistDigitalHumanHistory, runtimeApi])

  const handleStopGeneration = React.useCallback(async () => {
    const snapshot = taskStateRef.current
    if (!snapshot.isProcessing) return

    const taskIdToCancel = snapshot.taskId
    if (taskIdToCancel) {
      try {
        await fetch("/api/video/cancel", {
          ...VIDEO_FETCH,
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskIdToCancel }),
        })
      } catch {
      }
    }

    const message = "已停止生成（中断任务不会返还积分）"
    if (taskIdToCancel) {
      failTask(message, { taskId: taskIdToCancel, recordHistory: true })
    } else {
      failTask(message)
    }
    toast({ title: "已停止生成", description: "中断任务不会返还积分。", variant: "destructive" })
  }, [failTask])

  const handleReturnFromLocalPreview = React.useCallback(() => {
    stopEditPoll()
    stopAutoSubtitlePoll()
    setManualUploadId("")
    setManualVideoFile(null)
    setManualVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return ""
    })
    setAutoSubtitleBusy(false)
    setAutoSubtitlePath("")
    setAutoSubtitleText("")
    setSegmentCount(0)
    setSegmentsCompleted(0)
    updateTask({
      status: "pending",
      currentStage: "idle",
      taskId: "",
      isProcessing: false,
      isEditing: false,
      errorMessage: "",
      editingErrorMessage: "",
      progress: 0,
      videoUrl: "",
      coverUrl: "",
      coverStatus: "idle",
      coverError: "",
      coverTaskId: "",
      resumeGraceUntil: 0,
      pollErrorCount: 0,
      lastPollError: "",
      lastHeartbeat: 0,
      lastStatusAt: 0,
      videoStageStartedAt: 0,
      editJobId: "",
      editPollStartedAt: 0,
      autoSubtitleTaskId: "",
      autoSubtitleRunning: false,
      stageProgress: { voiceClone: 0, videoGen: 0, editing: 0 },
    })
    toast({ title: "已返回素材准备", description: "已保留图片、音频和文案，可直接重新生成。" })
  }, [updateTask])

  /** 登记到全局任务运行时（切页不丢进度，完成后写历史） */
  const startBackgroundPoll = React.useCallback((tid: string) => {
    stopBackgroundPoll()
    runtimeApi.register({
      kind: "digital-human",
      taskId: tid,
      progress: taskStateRef.current.progress || 5,
      stageLabel: "生成中",
      meta: {
        script: scriptRef.current.trim(),
        gender: genderRef.current,
        previewUrl: imagePreviewRef.current || "",
      },
    })
  }, [runtimeApi, stopBackgroundPoll])

  const handleGenerate = React.useCallback(async () => {
    if (!canGenerate || isProcessing) return
    if (runtimeApi.isRunning("digital-human")) {
      toast({
        title: "已有任务进行中",
        description: "请等待当前数字人口播完成，避免重复扣积分。",
        variant: "destructive",
      })
      return
    }
    if (!imageBase64 || !audioBase64) return
    const submittedAt = Date.now()
    updateTask({
      ...createGenerateSubmissionPatch(submittedAt),
      coverUrl: "",
      coverStatus: "idle",
      coverError: "",
      coverTaskId: "",
    })

    try {
      const res = await fetch("/api/video/generate", {
        ...VIDEO_FETCH,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_base64: imageBase64,
          audio_base64: audioBase64,
          script: script.trim(),
          gender,
          video_prompt: videoPrompt.trim(),
          video_prompt_mode: videoPromptMode,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(parseApiErrorResponse(res.status, data, "提交任务失败"))
      }

      const tid = data.task_id || data.taskId
      if (!tid) throw new Error("未返回 taskId")
      setSegmentCount(0)
      setSegmentsCompleted(0)
      const nextStageProgress = { voiceClone: 100, videoGen: 0, editing: 0 }
      updateTask({
        taskId: tid,
        status: "polling",
        currentStage: "video",
        lastHeartbeat: Date.now(),
        videoStageStartedAt: Date.now(),
        progress: calcOverallProgress(nextStageProgress),
        stageProgress: nextStageProgress,
      })

      // Start background poll using refs — survives re-render when navigating away
      startBackgroundPoll(tid)
    } catch (e) {
      failTask(e instanceof Error ? e.message : "生成过程出错，请重新点击生成")
    }
  }, [audioBase64, canGenerate, failTask, gender, imageBase64, isProcessing, runtimeApi, script, startBackgroundPoll, updateTask, videoPrompt, videoPromptMode])

  // 挂载时：若本地有进行中任务但 runtime 未跟踪，重新登记
  React.useEffect(() => {
    if (!taskId || !taskState.isProcessing) return
    if (taskState.currentStage === "editing") return // 剪辑子任务仍由页面内轮询
    const existing = runtimeApi.getTask("digital-human")
    if (existing?.taskId === taskId && existing.status === "running") return
    if (existing?.status === "running" && existing.taskId !== taskId) return
    startBackgroundPoll(taskId)
  }, [taskId, taskState.isProcessing, taskState.currentStage, runtimeApi, startBackgroundPoll])

  // 从全局 runtime 同步进度到本地 taskState（切页回来 / 后台完成）
  React.useEffect(() => {
    if (!runtimeTask) return
    if (runtimeTask.taskId && runtimeTask.taskId !== taskIdRef.current && taskStateRef.current.isProcessing) {
      // runtime 跟踪的是别的任务，忽略
      if (taskIdRef.current && runtimeTask.taskId !== taskIdRef.current) return
    }

    const now = Date.now()
    const videoUrl = String(runtimeTask.result?.videoUrl ?? "")
    const coverUrl = String(runtimeTask.result?.coverUrl ?? "")
    const coverStatusRaw = String(runtimeTask.result?.coverStatus ?? "")
    const coverError = String(runtimeTask.result?.coverError ?? "")
    const postStage = String(runtimeTask.result?.postStage ?? "")
    const postProgress =
      typeof runtimeTask.result?.postProgress === "number"
        ? runtimeTask.result.postProgress
        : 0
    const segCount = runtimeTask.result?.segmentCount
    const segDone = runtimeTask.result?.segmentsCompleted
    if (typeof segCount === "number" && segCount > 0) setSegmentCount(segCount)
    if (typeof segDone === "number") setSegmentsCompleted(segDone)

    if (runtimeTask.status === "running") {
      const awaitingPost = postStage === "running"
      const videoGen = Math.max(
        taskStateRef.current.stageProgress.videoGen,
        Math.min(100, runtimeTask.progress),
      )
      const stageProgress = {
        voiceClone: 100,
        videoGen: awaitingPost || videoUrl ? 100 : videoGen,
        editing: awaitingPost ? Math.max(30, postProgress) : videoUrl ? 100 : 0,
      }
      updateTask({
        taskId: runtimeTask.taskId,
        isProcessing: true,
        status: awaitingPost ? "post_processing" : "polling",
        currentStage: awaitingPost ? "editing" : "video",
        progress: calcOverallProgress(stageProgress),
        stageProgress,
        videoUrl: videoUrl || taskStateRef.current.videoUrl,
        coverUrl: coverUrl || taskStateRef.current.coverUrl,
        coverStatus: coverUrl
          ? "success"
          : coverStatusRaw === "running"
            ? "running"
            : coverStatusRaw === "failed"
              ? "failed"
              : taskStateRef.current.coverStatus,
        coverError: coverError || taskStateRef.current.coverError,
        postProcessingStage: awaitingPost ? "running" : postStage,
        postProcessingProgress: postProgress,
        lastStatusAt: now,
        lastHeartbeat: now,
        pollErrorCount: 0,
        lastPollError: "",
        resumeGraceUntil: 0,
        errorMessage: "",
      })
      return
    }

    if (runtimeTask.status === "success") {
      const stageProgress = { voiceClone: 100, videoGen: 100, editing: 100 }
      updateTask({
        taskId: runtimeTask.taskId,
        isProcessing: false,
        status: "success",
        currentStage: "done",
        progress: 100,
        stageProgress,
        videoUrl: videoUrl || taskStateRef.current.videoUrl,
        coverUrl: coverUrl || taskStateRef.current.coverUrl,
        coverStatus: coverUrl
          ? "success"
          : coverStatusRaw === "failed"
            ? "failed"
            : coverUrl
              ? "success"
              : "idle",
        coverError: coverError,
        postProcessingStage: postStage === "published" ? "published" : "",
        postProcessingProgress: 100,
        lastStatusAt: now,
        resumeGraceUntil: 0,
        errorMessage: "",
      })
      return
    }

    if (runtimeTask.status === "failed") {
      updateTask({
        taskId: runtimeTask.taskId,
        isProcessing: false,
        status: "failed",
        currentStage: "failed",
        errorMessage: runtimeTask.error || "生成失败",
        lastStatusAt: now,
        resumeGraceUntil: 0,
      })
    }
  }, [runtimeTask, updateTask])

  // 重新挂载时恢复自动字幕轮询
  React.useEffect(() => {
    const shouldResumeSubtitle =
      taskState.autoSubtitleRunning &&
      !!taskState.autoSubtitleTaskId &&
      !autoSubtitlePollRef.current

    if (!shouldResumeSubtitle) {
      if (!taskState.autoSubtitleRunning || !taskState.autoSubtitleTaskId) {
        stopAutoSubtitlePoll()
      }
      return
    }

    // 恢复 UI 状态并重启轮询
    setAutoSubtitleBusy(true)
    startAutoSubtitlePoll(taskState.autoSubtitleTaskId)
  }, [taskState.autoSubtitleRunning, taskState.autoSubtitleTaskId, startAutoSubtitlePoll, stopAutoSubtitlePoll])

  React.useEffect(() => {
    if (!taskState.isProcessing) return
    const checkHealth = () => {
      if (skipNextHealthCheckRef.current) {
        skipNextHealthCheckRef.current = false
        return
      }
      const snapshot = taskStateRef.current
      // 恢复宽限期内不触发任何健康检查（切屏回来时给轮询足够时间拿到首次响应）
      if (snapshot.resumeGraceUntil > Date.now()) return
      const health = getTaskHealth(snapshot)
      if (!health.shouldFail) return
      const message = getTaskHealthMessage(snapshot) || "任务状态异常，已停止自动轮询。"
      failTask(message, { recordHistory: true })
      toast({ title: "任务状态异常", description: message, variant: "destructive" })
    }
    checkHealth()
    const id = window.setInterval(checkHealth, 5000)
    return () => window.clearInterval(id)
  }, [failTask, taskState.isProcessing])

  // 心跳计时器 — 当用户在 voice 阶段时，按时间估算音色克隆进度
  // 切走页面或刷新后，lastHeartbeat 已经在 localStorage 保留，估算可恢复
  React.useEffect(() => {
    if (currentStage !== "voice") return
    if (!taskState.lastHeartbeat) return  // 0 心跳 = 异常状态，不估算
    const tick = () => {
      const stageElapsed = Math.floor((Date.now() - taskState.lastHeartbeat) / 1000)
      const est = estimateVoiceCloneProgress(stageElapsed)
      const prev = loadTask()
      if (!prev) return
      if (prev.stageProgress.voiceClone >= 100) return
      if (est <= prev.stageProgress.voiceClone) return
      updateTask({
        stageProgress: { voiceClone: est, videoGen: prev.stageProgress.videoGen, editing: prev.stageProgress.editing },
        progress: calcOverallProgress({ voiceClone: est, videoGen: prev.stageProgress.videoGen, editing: prev.stageProgress.editing }),
      })
    }
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [currentStage, taskState.lastHeartbeat])

  // 自动编辑进度 — 从 currentStage="editing" 开始后，3 秒匀速推到 100%
  React.useEffect(() => {
    if (currentStage !== "editing") return
    const startedAt = Date.now()
    const tick = () => {
      const elapsed = (Date.now() - startedAt) / 1000
      const p = Math.min(100, Math.round((elapsed / 30) * 100))
      const prev = loadTask()
      if (!prev) return
      if (prev.stageProgress.editing >= 100) return
      updateTask({
        stageProgress: { voiceClone: prev.stageProgress.voiceClone, videoGen: prev.stageProgress.videoGen, editing: p },
        progress: calcOverallProgress({ voiceClone: prev.stageProgress.voiceClone, videoGen: prev.stageProgress.videoGen, editing: p }),
      })
    }
    const id = window.setInterval(tick, 500)
    return () => window.clearInterval(id)
  }, [currentStage])

  const startEditPoll = React.useCallback((jobId: string) => {
    stopEditPoll()
    const sessionId = editPollSessionRef.current

    const pollOnce = async () => {
      if (editPollInFlightRef.current || editPollSessionRef.current !== sessionId) return

      editPollInFlightRef.current = true
      let scheduleNext = true
      try {
        const statusResp = await fetch(
          `/api/video/edit/status?editJobId=${encodeURIComponent(jobId)}`,
          VIDEO_FETCH,
        )
        const statusData = (await statusResp.json()) as EditTaskResponse & { detail?: unknown }

        if (editPollSessionRef.current !== sessionId) return

        if (!statusResp.ok) {
          updateTask({
            editingErrorMessage: parseApiErrorResponse(
              statusResp.status,
              statusData,
              "查询剪辑状态失败",
            ),
          })
        } else if (statusData.status === "success" && statusData.output_video_url) {
          scheduleNext = false
          stopEditPoll()
          const completedStageProgress = { ...taskStateRef.current.stageProgress, editing: 100 }
          const finalUrl = resolveMediaUrl(statusData.output_video_url)
            setVideoUrl(finalUrl)
            updateTask({
              currentStage: "done",
              status: "published",
              errorMessage: "",
              editingErrorMessage: "",
              isEditing: false,
              editJobId: "",
              editPollStartedAt: 0,
              progress: 100,
              videoUrl: finalUrl,
              postProcessingStage: "published",
              postProcessingProgress: 100,
              stageProgress: completedStageProgress,
            })
            toast({ title: "剪辑完成", description: "视频已应用所选效果，可切换预设再次剪辑" })
            return
          } else if (statusData.status === "failed") {
            scheduleNext = false
            stopEditPoll()
            updateTask({
              editingErrorMessage: statusData.error || "剪辑失败，请重试",
              isEditing: false,
              editJobId: "",
              editPollStartedAt: 0,
            })
            toast({ title: "剪辑失败", description: statusData.error || "剪辑失败，请重试", variant: "destructive" })
            return
          } else {
            // Still processing — update progress
            updateTask({
              postProcessingStage: statusData.status,
              postProcessingProgress: typeof statusData.progress === "number" ? statusData.progress : 30,
            })
          }
        } catch {
          if (editPollSessionRef.current !== sessionId) return
        } finally {
          editPollInFlightRef.current = false
          if (scheduleNext && editPollSessionRef.current === sessionId) {
            editPollRef.current = setTimeout(() => { void pollOnce() }, 1500)
          }
        }
    }

    void pollOnce()
  }, [stopEditPoll, updateTask, setVideoUrl])

  const handleApplyEditing = React.useCallback(async () => {
    if (isEditing) return

    const resetEditingProgress = { ...taskStateRef.current.stageProgress, editing: 0 }
    setIsEditing(true)
    updateTask({
      currentStage: "editing",
      status: "success",
      errorMessage: "",
      editingErrorMessage: "",
      isEditing: true,
      editJobId: "",
      editPollStartedAt: 0,
      lastHeartbeat: Date.now(),
      stageProgress: resetEditingProgress,
      progress: calcOverallProgress(resetEditingProgress),
    })

    const handleEditingSubmitFailure = (message: string, title = "剪辑失败") => {
      setIsEditing(false)
      updateTask({
        currentStage: "done",
        status: "success",
        errorMessage: "",
        editingErrorMessage: message,
        isEditing: false,
        editJobId: "",
        editPollStartedAt: 0,
        stageProgress: resetEditingProgress,
        progress: calcOverallProgress(resetEditingProgress),
      })
      toast({ title, description: message, variant: "destructive" })
    }

    try {
      const res = await fetch("/api/video/edit", {
        ...VIDEO_FETCH,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          task_id: taskIdRef.current,
          video_url: manualUploadId ? "" : (videoUrl || manualVideoPreview),
          upload_id: manualUploadId,
          preset: selectedPreset,
          // 极简成片不叠加名片；其余风格沿用用户填写的名片文案
          business_card_text:
            selectedPreset === "minimal" ? "" : businessCardText.trim(),
          enable_bgm: enableBgm && selectedPreset !== "minimal",
          enable_subtitles: enableSubtitles,
          bgm_volume:
            enableBgm && selectedPreset !== "minimal" ? 0.35 : 0,
          subtitle_file_path: enableSubtitles ? autoSubtitlePath : "",
          subtitle_text: enableSubtitles ? script.trim() : "",
          source: manualUploadId ? "manual" : manualVideoPreview ? "manual" : isLocalPreviewMode ? "manual" : "generated",
          slide_images_base64: slideImages.map((img) => img.base64),
        }),
      })
      const data = (await res.json()) as EditTaskResponse & { detail?: unknown }
      if (!res.ok) {
        handleEditingSubmitFailure(
          parseApiErrorResponse(res.status, data, "剪辑失败，请重试"),
        )
        return
      }
      const jobId = data.edit_job_id
      if (!jobId) {
        handleEditingSubmitFailure("未返回剪辑任务 ID")
        return
      }

      // 持久化 editJobId 并启动后台轮询（跨界面切换后可恢复）
      updateTask({
        editJobId: jobId,
        editPollStartedAt: Date.now(),
      })
      startEditPoll(jobId)
    } catch {
      handleEditingSubmitFailure("剪辑请求失败，请检查服务是否启动", "网络错误")
    }
  }, [businessCardText, enableBgm, enableSubtitles, isEditing, isLocalPreviewMode, manualUploadId, manualVideoPreview, script, selectedPreset, setIsEditing, setVideoUrl, slideImages, startEditPoll, updateTask, videoUrl, autoSubtitlePath])

  // 重新挂载时恢复剪辑轮询（切页回来时 editJobId 还在 localStorage 但 editPollRef 已失）
  React.useEffect(() => {
    const shouldResumeEdit =
      taskState.currentStage === "editing" &&
      taskState.isEditing &&
      !!taskState.editJobId &&
      !editPollRef.current

    if (!shouldResumeEdit) {
      if (!taskState.isEditing || !taskState.editJobId) {
        stopEditPoll()
      }
      return
    }

    const now = Date.now()
    if (taskState.resumeGraceUntil < now) {
      updateTask({ resumeGraceUntil: now + RESUME_POLL_GRACE_MS })
    }

    startEditPoll(taskState.editJobId)
  }, [taskState.currentStage, taskState.isEditing, taskState.editJobId, taskState.resumeGraceUntil, startEditPoll, stopEditPoll, updateTask])

  // 组件卸载时清理编辑轮询
  React.useEffect(() => {
    return () => { stopEditPoll() }
  }, [stopEditPoll])

  const handleRetry = React.useCallback(() => {
    stopBackgroundPoll()
    stopEditPoll()
    stopAutoSubtitlePoll()
    setAutoSubtitleBusy(false)
    setAutoSubtitlePath("")
    setAutoSubtitleText("")
    setSegmentCount(0)
    setSegmentsCompleted(0)
    updateTask({
      taskId: "",
      status: "pending",
      progress: 0,
      stageProgress: { voiceClone: 0, videoGen: 0, editing: 0 },
      currentStage: "idle",
      lastHeartbeat: 0,
      isProcessing: false,
      errorMessage: "",
      editingErrorMessage: "",
      videoUrl: "",
      coverUrl: "",
      coverStatus: "idle",
      coverError: "",
      coverTaskId: "",
      submittedAt: 0,
      lastStatusAt: 0,
      resumeGraceUntil: 0,
      pollErrorCount: 0,
      lastPollError: "",
      editJobId: "",
      editPollStartedAt: 0,
      autoSubtitleTaskId: "",
      autoSubtitleRunning: false,
    })
  }, [stopBackgroundPoll, stopEditPoll, stopAutoSubtitlePoll, updateTask])

  const handleRetryCover = React.useCallback(async () => {
    if (!taskId || coverRetryBusy) return

    setCoverRetryBusy(true)
    updateTask({
      coverUrl: "",
      coverStatus: "running",
      coverError: "",
      coverTaskId: "",
    })

    try {
      const res = await fetch("/api/video/cover", {
        ...VIDEO_FETCH,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(parseApiErrorResponse(res.status, data, "封面重试失败"))
      }

      updateTask({
        coverUrl: typeof data.cover_url === "string" ? data.cover_url : "",
        coverStatus: "success",
        coverError: "",
        coverTaskId: typeof data.cover_task_id === "string" ? data.cover_task_id : "",
      })
      toast({ title: "封面生成成功", description: "已更新视频封面，可直接下载使用。" })
    } catch (error) {
      updateTask({
        coverStatus: "failed",
        coverError: error instanceof Error ? error.message : "封面重试失败",
        coverTaskId: "",
      })
      toast({ title: "封面生成失败", description: error instanceof Error ? error.message : "请稍后重试", variant: "destructive" })
    } finally {
      setCoverRetryBusy(false)
    }
  }, [coverRetryBusy, taskId, updateTask])

  const steps = [
    { id: 1 as StepId, label: "素材准备", status: stepStatuses[1] },
    { id: 2 as StepId, label: "音色克隆", status: stepStatuses[2] },
    { id: 3 as StepId, label: "视频生成", status: stepStatuses[3] },
    { id: 4 as StepId, label: "自动剪辑", status: stepStatuses[4] },
  ]

  return (
    <VideoWorkflowPage>
        <WorkflowHero
          accentColor="rose"
          title="AI"
          accentWord="数字人口播"
          description="上传形象照片与参考音色，输入口播文案，AI 自动完成音色克隆、数字人口播生成与智能剪辑"
        />

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <WorkflowStepIndicator
            accentColor="rose"
            steps={steps}
          />
          {taskId && (
            <span className="text-[11px] text-slate-400">
              任务 ID：{taskId}
            </span>
          )}
        </div>

        {materialsLost && !storageWarningMessage && (
          <div className="mb-6 rounded-2xl border border-blue-200/60 bg-blue-50/70 p-4 dark:border-blue-500/20 dark:bg-blue-500/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-[14px] font-medium text-blue-800 dark:text-blue-300">
                  浏览器刷新后素材需要重新上传
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-blue-700 dark:text-blue-400">
                  为避免 localStorage 配额超限（仅 ~5 MB），图片与音频不会自动保存到本地。重新上传素材后即可继续创作。
                </p>
              </div>
            </div>
          </div>
        )}

        {storageWarningMessage && (
          <div className="mb-6 rounded-2xl border border-amber-200/60 bg-amber-50/70 p-4 dark:border-amber-500/20 dark:bg-amber-500/5">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <div>
                <p className="text-[14px] font-medium text-amber-800 dark:text-amber-300">
                  当前素材未完整保存到本地
                </p>
                <p className="mt-1 text-[12px] leading-relaxed text-amber-700 dark:text-amber-400">
                  {storageWarningMessage}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/*  Step 1: Material Upload                                          */}
        {/* ================================================================ */}
        {activeStep >= 1 && (
          <section className={cn("space-y-5", activeStep > 1 && "opacity-50 pointer-events-none")}>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">1</span>
              <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-200">素材准备</h2>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Image Upload + 剪辑选项（竖向） */}
              <div className="flex flex-col gap-3">
                {hasImage ? (
                  <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-white/10 dark:bg-white/5">
                    <img
                      src={imagePreviewSrc}
                      alt="数字人形象"
                      className="aspect-square w-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent p-3">
                      <span className="text-[11px] text-white">形象照片</span>
                      <button
                        type="button"
                        onClick={() => {
                          setImage(null)
                          updateTask({ imageBase64: "", imagePreview: "" })
                        }}
                        className="rounded-lg bg-white/20 px-2 py-0.5 text-[11px] text-white backdrop-blur hover:bg-white/30"
                      >
                        更换
                      </button>
                    </div>
                  </div>
                ) : (
                  <UploadZone
                    accept={ACCEPTED_IMAGES}
                    label="上传数字人形象"
                    icon={ImageIcon}
                    hint="JPG / PNG / WebP"
                    onFile={handleImageFile}
                  />
                )}

                <VideoClipOptions
                  layout="vertical"
                  enableBgm={enableBgm}
                  enableSubtitles={enableSubtitles}
                  onEnableBgmChange={setEnableBgm}
                  onEnableSubtitlesChange={setEnableSubtitles}
                />
              </div>

              {/* Audio Upload + Video Prompt */}
              <div className="flex flex-col gap-4">
                <div>
                  {hasAudio ? (
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 dark:bg-rose-500/10">
                          <Mic className="h-5 w-5 text-rose-400" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                            {audioName || "已上传参考音色"}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {audio?.file
                              ? `${formatSize(audio.file.size)} · ${audioDuration || "时长未知"}`
                              : audioDuration
                                ? `时长 ${audioDuration}`
                                : "已恢复已上传音频"}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAudio(null)
                          updateTask({ audioBase64: "", audioName: "", audioDuration: "" })
                        }}
                        className="self-end rounded-lg bg-slate-100 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10"
                      >
                        更换
                      </button>
                    </div>
                  ) : (
                    <UploadZone
                      accept={ACCEPTED_AUDIO}
                      label="上传参考音色"
                      icon={Mic}
                      hint="MP3 / WAV / M4A"
                      onFile={handleAudioFile}
                    />
                  )}
                </div>

                {/* Video Prompt Panel — maps to AI workflow action node */}
                <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
                      <Sparkles className="h-4 w-4 text-rose-400" />
                    </span>
                    <div>
                      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">视频提示词</p>
                      <p className="text-[11px] text-slate-400">用于控制数字人口播时的动作节奏</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(VIDEO_PROMPT_MODE_LABELS) as VideoPromptMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => applyVideoPromptPreset(mode)}
                        className={cn(
                          "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                          videoPromptMode === mode
                            ? "bg-rose-500 text-white shadow-sm"
                            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300 dark:hover:bg-white/10",
                        )}
                      >
                        {VIDEO_PROMPT_MODE_LABELS[mode]}
                      </button>
                    ))}
                  </div>

                  <textarea
                    rows={5}
                    value={resolveVideoPrompt(videoPrompt)}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    placeholder={VIDEO_PROMPT_PRESETS[DEFAULT_VIDEO_PROMPT_MODE]}
                    className="min-h-[120px] w-full resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[12px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
                  />
                  <p className="text-[11px] text-slate-400">
                    默认 5 行；可手动编辑后提交，最终内容会同步到 254 节点的 text 字段
                  </p>
                </div>
              </div>

              {/* Script Input */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
                    <FileText className="h-4 w-4 text-rose-400" />
                  </span>
                  <span className="text-[13px] font-medium text-slate-700 dark:text-slate-300">口播文案</span>
                  <span className="ml-auto text-[11px] text-slate-400">{script.length} 字</span>
                </div>
                <textarea
                  className="min-h-[100px] flex-1 resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[13px] leading-relaxed text-slate-800 placeholder:text-slate-400 focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-500/15 dark:border-white/5 dark:bg-white/5 dark:text-slate-200"
                  placeholder="手动输入口播文案，或从文案创作板块一键导入…"
                  value={script}
                  onChange={(e) => setScript(e.target.value)}
                />
                {initialScript && (
                  <p className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" />
                    已从文案创作导入
                  </p>
                )}

                <div className="rounded-2xl border border-slate-200/60 bg-slate-50/70 p-4 dark:border-white/10 dark:bg-slate-950/30">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-rose-50 text-rose-500 dark:bg-rose-500/10"><FileText className="h-4 w-4" /></span>
                    <div>
                      <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">个人名片</p>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">非必填，仅为后续名片烧录提供文案</p>
                    </div>
                  </div>
                  <textarea
                    value={businessCardText}
                    onChange={(e) => setBusinessCardTextState(e.target.value)}
                    placeholder={cardInfo.placeholder}
                    rows={4}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-[13px] text-slate-700 outline-none transition focus:border-rose-400 dark:border-white/10 dark:bg-slate-950/50 dark:text-slate-200"
                  />
                </div>
              </div>
            </div>

            {/* Gender Selector */}
            <div className="flex items-center justify-center gap-3">
              <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400">数字人性别：</span>
              <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-white/10">
                <button
                  type="button"
                  onClick={() => setGender("female")}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all",
                    gender === "female"
                      ? "bg-white text-rose-600 shadow-sm dark:bg-rose-500/20 dark:text-rose-400"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                  )}
                >
                  女
                </button>
                <button
                  type="button"
                  onClick={() => setGender("male")}
                  className={cn(
                    "rounded-lg px-4 py-1.5 text-[13px] font-medium transition-all",
                    gender === "male"
                      ? "bg-white text-blue-600 shadow-sm dark:bg-blue-500/20 dark:text-blue-400"
                      : "text-slate-500 hover:text-slate-700 dark:text-slate-400",
                  )}
                >
                  男
                </button>
              </div>
            </div>

            {/* Generate Buttons */}
            <div className="flex flex-col items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/5">
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || isProcessing}
                className={cn(
                  "inline-flex items-center gap-2 rounded-2xl px-8 py-3.5 text-[15px] font-bold shadow-lg transition-all duration-300",
                  canGenerate && !isProcessing
                    ? "bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-rose-500/25 hover:from-rose-600 hover:to-pink-600 active:scale-[0.97]"
                    : "bg-slate-100 text-slate-400 dark:bg-white/5 dark:text-slate-600",
                )}
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Play className="h-5 w-5" />
                    一键生成口播视频
                    <span className="ml-1 text-[12px] font-normal opacity-75">· 约 20-50 分钟</span>
                  </>
                )}
              </Button>
              {isProcessing && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" size="sm" className="rounded-xl">
                      <Square className="h-4 w-4" />
                      停止生成
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>停止生成？</AlertDialogTitle>
                      <AlertDialogDescription>
                        将立即中断本次任务跟踪，已消耗积分不返还。
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>继续生成</AlertDialogCancel>
                      <AlertDialogAction asChild>
                        <Button variant="destructive" onClick={() => void handleStopGeneration()}>
                          停止生成
                        </Button>
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {/* 仅剪辑模式：跳过远程生成，使用本地图片/音频直接进入 Step 4 */}
              {canGenerate && !isProcessing && (
                <button
                  type="button"
                  onClick={() => {
                    updateTask({
                      status: "success",
                      currentStage: "done",
                      taskId: "",
                      isProcessing: false,
                      isEditing: false,
                      errorMessage: "",
                      editingErrorMessage: "",
                      progress: 100,
                      videoUrl: "",
                      coverUrl: "",
                      coverStatus: "idle",
                      coverError: "",
                      coverTaskId: "",
                      resumeGraceUntil: 0,
                      pollErrorCount: 0,
                      lastPollError: "",
                      stageProgress: { voiceClone: 100, videoGen: 100, editing: 0 },
                    })
                    toast({
                      title: "进入剪辑调试模式",
                      description: "现在可以手动上传视频，直接测试后处理效果。",
                    })
                  }}
                  className="rounded-xl px-4 py-2 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-300"
                >
                  🎬 跳过生成，直接剪辑
                </button>
              )}
            </div>
          </section>
        )}

        {/* ================================================================ */}
        {/*  Step 2-3: Processing Status                                     */}
        {/* ================================================================ */}
        {(activeStep === 2 || activeStep === 3) && (
          <section className="mt-6 rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5">
            {/* Step 2: Voice Cloning */}
            <div className={cn("flex items-start gap-4", activeStep === 3 && "mb-4 pb-4 border-b border-slate-100 dark:border-white/5")}>
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                  stepStatuses[2] === "done"
                    ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                    : stepStatuses[2] === "loading"
                      ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                      : "bg-slate-100 text-slate-400",
                )}
              >
                {stepStatuses[2] === "done" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : stepStatuses[2] === "loading" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <span className="text-[11px] font-bold">2</span>
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                  音色克隆
                </p>
                <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                  {stepStatuses[2] === "loading"
                    ? "正在使用参考音频进行音色克隆…"
                    : stepStatuses[2] === "done"
                      ? "音色克隆完成，已生成专属 TTS 音色"
                      : "等待上一步完成"}
                </p>

                {/* Voice Clone Progress Bar */}
                {stepStatuses[2] === "loading" && (
                  <div className="mt-2 space-y-1">
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 transition-all duration-500"
                        style={{ width: `${stageProgress.voiceClone}%` }}
                      />
                      <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.45)_40%,transparent_60%)] bg-[length:200%_100%] animate-[progress-shine_1.5s_linear_infinite]" />
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-400">{stageProgress.voiceClone}%</p>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="text-[11px] text-slate-400 underline-offset-2 transition-colors hover:text-slate-600 hover:underline"
                      >
                        任务无响应？重新开始
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Step 3: Video Generation */}
            {activeStep >= 3 && (
              <div className="flex items-start gap-4">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                    stepStatuses[3] === "done"
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                      : stepStatuses[3] === "loading"
                        ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400"
                        : stepStatuses[3] === "error"
                          ? "bg-amber-100 text-amber-600"
                          : "bg-slate-100 text-slate-400",
                  )}
                >
                  {stepStatuses[3] === "done" ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : stepStatuses[3] === "loading" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : stepStatuses[3] === "error" ? (
                    <AlertCircle className="h-4 w-4" />
                  ) : (
                    <span className="text-[11px] font-bold">3</span>
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                    数字人口播视频生成
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">
                    {stepStatuses[3] === "loading"
                      ? segmentCount > 1
                        ? `视频生成中 (${Math.max(segmentsCompleted, 0)}/${segmentCount})，预计 20-50 分钟…`
                        : "正在使用克隆音色 + 数字人形象生成口播视频，预计 20-50 分钟…"
                      : stepStatuses[3] === "done"
                        ? "视频生成完成！可在下一步预览半成品并手动进入自动剪辑"
                        : stepStatuses[3] === "error"
                          ? "任务已停止，请根据下方提示处理后重新生成"
                          : "等待上一步完成"}
                  </p>

                  {(stepStatuses[3] === "loading" || stepStatuses[3] === "error") && (
                    <div className="mt-2 space-y-1 text-[11px] text-slate-400">
                      {submittedAtLabel && <p>提交时间：{submittedAtLabel}</p>}
                      <p>最近状态同步：{lastStatusAtLabel}</p>
                      {taskState.pollErrorCount > 0 && <p>轮询异常：{taskState.pollErrorCount} 次</p>}
                    </div>
                  )}

                  {/* Progress Bar — videoGen */}
                  {stepStatuses[3] === "loading" && (
                    <div className="mt-3 space-y-1.5">
                      <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                        <div
                          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-rose-500 via-pink-500 to-fuchsia-500 transition-all duration-500"
                          style={{ width: `${stageProgress.videoGen}%` }}
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(110deg,transparent_20%,rgba(255,255,255,0.42)_40%,transparent_60%)] bg-[length:200%_100%] animate-[progress-shine_1.5s_linear_infinite]" />
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {segmentCount > 1
                          ? `视频生成中 (${Math.max(segmentsCompleted, 0)}/${segmentCount}) · ${stageProgress.videoGen}%`
                          : `${stageProgress.videoGen}%`}
                      </p>
                    </div>
                  )}

                  {/* Error + Retry */}
                  {(stepStatuses[3] === "error" || readableTaskErrorMessage) && (
                    <div className="mt-3 rounded-xl border border-amber-200/60 bg-amber-50/50 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                      <div className="flex items-start gap-2">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                        <div>
                          <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                            任务处理异常
                          </p>
                          <p className="text-[12px] text-amber-700 dark:text-amber-400">
                            {readableTaskErrorMessage || "服务端返回错误，请重新点击生成按钮。"}
                          </p>
                          {taskState.lastPollError && (
                            <p className="mt-1 text-[12px] text-amber-700/90 dark:text-amber-400/90">
                              最近一次轮询异常：{taskState.lastPollError}
                            </p>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={handleRetry}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-rose-500 px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-rose-600"
                      >
                        <RefreshCw className="h-4 w-4" />
                        重新开始任务
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        )}

        {/* ================================================================ */}
        {/*  Step 4: Video Preview + Editing Presets                           */}
        {/* ================================================================ */}
        {activeStep >= 4 && (
          <section className="mt-6 space-y-5">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">4</span>
              <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-200">预览与剪辑</h2>
              <button
                type="button"
                onClick={handleRetry}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/5 dark:hover:text-slate-300"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                回到素材准备
              </button>
            </div>

            {/* Video Player */}
            {videoUrl && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-black">
                <video
                  src={videoUrl}
                  controls
                  disablePictureInPicture
                  className="w-full"
                  style={{ maxHeight: "480px" }}
                  poster={localPreviewImageSrc}
                >
                  您的浏览器不支持视频播放
                </video>
              </div>
            )}

            {videoUrl && status === "success" && !isEditing && (
              <p className="rounded-xl border border-amber-200/60 bg-amber-50/60 px-4 py-3 text-[13px] text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
                当前为拼接完成的半成品预览。请确认画面无误后，在下方选择剪辑风格并点击「自动剪辑」生成成片。
              </p>
            )}

            {(videoUrl || isLocalPreviewMode) && (
              <div className="flex flex-wrap gap-2">
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium",
                    enableBgm
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400",
                  )}
                >
                  <Music className="h-3.5 w-3.5" />
                  BGM：{enableBgm ? "开" : "关"}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium",
                    enableSubtitles
                      ? "bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300"
                      : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400",
                  )}
                >
                  <Captions className="h-3.5 w-3.5" />
                  字幕：{enableSubtitles ? "开" : "关"}
                </span>
                <span className="text-[12px] text-slate-400 self-center">
                  可在步骤 1 修改
                </span>
              </div>
            )}

            {(videoUrl || isLocalPreviewMode) && (
              <EditingStylePanel
                value={selectedPreset}
                onChange={setSelectedPreset}
                disabled={isEditing || manualUploadBusy}
              />
            )}

            {isLocalPreviewMode && (
              <div className="overflow-hidden rounded-2xl border border-slate-200/60 bg-white dark:border-white/10 dark:bg-white/5">
                <div className="grid gap-4 p-4 lg:grid-cols-[1.2fr_0.8fr]">
                  <div className="space-y-3">
                    <div className="overflow-hidden rounded-xl border border-slate-200/60 bg-black dark:border-white/10">
                      {manualVideoPreview ? (
                        <video src={manualVideoPreview} controls disablePictureInPicture className="w-full" style={{ maxHeight: "380px" }} />
                      ) : (
                        <div className="flex h-[240px] items-center justify-center text-[13px] text-slate-400">请先上传视频</div>
                      )}
                    </div>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400">当前为剪辑调试模式，适合直接上传视频验证字幕烧录、BGM、名片和模板效果。</p>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={handleReturnFromLocalPreview} disabled={manualUploadBusy}>
                        返回素材准备
                      </Button>
                      <span className="text-[12px] text-slate-400">{manualUploadLabel}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <UploadZone
                      accept="video/*"
                      label={manualUploadBusy ? "处理中…" : "手动上传视频"}
                      icon={Play}
                      hint="用于直接进入后处理调试，不走生成流程"
                      disabled={manualUploadBusy}
                      onFile={(f) => void handleManualVideoUpload(f)}
                    />
                    <div className="rounded-xl border border-dashed border-slate-200 p-3 text-[12px] text-slate-500 dark:border-white/10 dark:text-slate-400">
                      上传后会自动执行后处理，并覆盖展示最终成片。
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* No video URL yet */}
            {!videoUrl && !isLocalPreviewMode && (
              <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-200 py-12 dark:border-white/10">
                <Clapperboard className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                <p className="text-[14px] text-slate-400">视频正在生成中，完成后将在此预览</p>
              </div>
            )}

            {/* Cover Image */}
            {videoUrl && (
              <div className="flex items-start gap-4 rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                <div className="h-28 w-20 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-white/5">
                  {coverUrl ? (
                    <img src={coverUrl} alt="封面图" className="h-full w-full object-cover" />
                  ) : coverUi.kind === "failed" ? (
                    <div className="flex h-full w-full items-center justify-center bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400">
                      <AlertCircle className="h-5 w-5" />
                    </div>
                  ) : coverUi.kind === "idle" ? (
                    <div className="flex h-full w-full items-center justify-center bg-slate-50 text-slate-300 dark:bg-white/5 dark:text-slate-600">
                      <ImageIcon className="h-5 w-5" />
                    </div>
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">视频封面</p>
                  <p className="mt-0.5 text-[12px] text-slate-500 dark:text-slate-400">
                    {coverUi.message}
                  </p>
                  {coverTaskId && coverUi.kind === "running" && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      封面任务 ID：{coverTaskId}
                    </p>
                  )}
                  {coverUrl && (
                    <a
                      href={coverUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      download
                      className="mt-2 inline-flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-[12px] font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                    >
                      <Download className="h-3.5 w-3.5" />
                      下载封面
                    </a>
                  )}
                  {coverUi.allowRetry && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => { void handleRetryCover() }}
                      disabled={coverRetryBusy}
                      className="mt-2"
                    >
                      {coverRetryBusy ? "重新生成中..." : "重新生成封面"}
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* 图片素材插入（可选） */}
            {(videoUrl || isLocalPreviewMode) && (
              <div className="rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5">
                <div className="flex items-center gap-2 mb-3">
                  <ImagePlus className="h-4 w-4 text-slate-500" />
                  <p className="text-[14px] font-semibold text-slate-800 dark:text-slate-200">
                    添加滚动图文（可选）
                  </p>
                  {slideImages.length > 0 && (
                    <span className="text-[12px] text-slate-400">
                      已上传 {slideImages.length} 张
                    </span>
                  )}
                </div>
                <p className="mb-3 text-[12px] text-slate-500 dark:text-slate-400">
                  图片将依次显示在视频下方，每张展示 1.5 秒，间隔 3 秒轮播。支持 jpg / png / webp。
                </p>
                {/* 缩略图预览 */}
                {slideImages.length > 0 && (
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-2">
                    {slideImages.map((img, idx) => (
                      <div key={idx} className="relative shrink-0 group">
                        <img
                          src={img.previewUrl}
                          alt={`素材 ${idx + 1}`}
                          className="h-20 w-20 rounded-lg object-cover border border-slate-200 dark:border-white/10"
                        />
                        <button
                          type="button"
                          onClick={() => removeSlideImage(idx)}
                          className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                          title="删除"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        <span className="absolute bottom-0 left-0 right-0 rounded-b-lg bg-black/50 text-center text-[10px] text-white py-0.5">
                          {idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <UploadZone
                  accept=".jpg,.jpeg,.png,.webp"
                  label="上传轮播图片"
                  icon={ImagePlus}
                  hint="拖放或点击上传，可多次添加"
                  onFile={(f) => { void handleSlideImageFile(f) }}
                />
              </div>
            )}

            {/* 自动字幕生成（可选预览）+ 应用剪辑 */}
            <div className="flex flex-col items-center gap-3 border-t border-slate-100 pt-5 dark:border-white/5">
              {enableSubtitles ? (
                <>
                  {/* AI 字幕校对 — 可选预览；不点也会在「应用剪辑」时自动 ASR+校对 */}
                  <button
                    type="button"
                    onClick={() => { void handleAutoSubtitle() }}
                    disabled={autoSubtitleBusy || !editableVideoUrl || manualUploadBusy}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13px] font-medium transition-all",
                      autoSubtitlePath
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:hover:bg-violet-900/30",
                      "disabled:opacity-50 disabled:cursor-not-allowed",
                    )}
                  >
                    {autoSubtitleBusy ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        校对中…
                      </>
                    ) : autoSubtitlePath ? (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        字幕已校对（原文案 + 精确时间轴）
                      </>
                    ) : (
                      <>
                        <Wand2 className="h-4 w-4" />
                        AI 字幕校对（可选预览）
                      </>
                    )}
                  </button>
                  {autoSubtitleText && (
                    <p className="max-w-md text-center text-[12px] text-muted-foreground line-clamp-2">
                      {autoSubtitleText.slice(0, 100)}{autoSubtitleText.length > 100 ? "…" : ""}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[12px] text-slate-400">
                  已关闭自动字幕，成片将不烧录字幕
                </p>
              )}

              <Button
                onClick={() => { void handleApplyEditing() }}
                disabled={isEditing || !editableVideoUrl || manualUploadBusy}
                className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-rose-500 to-pink-500 px-8 py-3.5 text-[15px] font-bold text-white shadow-lg shadow-rose-500/25 transition-all hover:from-rose-600 hover:to-pink-600 active:scale-[0.97] disabled:opacity-60"
              >
                {isEditing ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    {enableSubtitles ? "渲染中（字幕校对 + 剪辑）…" : "渲染中…"}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5" />
                    应用「{getEditingPreset(selectedPreset).name}」
                    {enableSubtitles || enableBgm
                      ? `（${[
                          enableSubtitles ? "字幕" : null,
                          enableBgm && selectedPreset !== "minimal" ? "BGM" : null,
                        ]
                          .filter(Boolean)
                          .join(" + ") || "无字幕无 BGM"}）`
                      : "（无字幕无 BGM）"}
                  </>
                )}
              </Button>
              {!isLocalPreviewMode && editingErrorMessage && !isEditing && (
                <div className="w-full max-w-xl rounded-xl border border-amber-200/60 bg-amber-50/60 p-3 dark:border-amber-500/20 dark:bg-amber-500/5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-amber-800 dark:text-amber-300">
                        剪辑失败
                      </p>
                      <p className="text-[12px] text-amber-700 dark:text-amber-400">
                        {editingErrorMessage}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => { void handleApplyEditing() }}
                    className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-100 px-3 py-1.5 text-[12px] font-medium text-amber-700 transition-colors hover:bg-amber-200 dark:bg-amber-500/10 dark:text-amber-400 dark:hover:bg-amber-500/20"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    重试剪辑
                  </button>
                </div>
              )}
              {isEditing && currentStage === "editing" ? (
                <div className="flex w-full max-w-sm flex-col items-center gap-2">
                  <div className="h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${stageProgress.editing}%` }}
                    />
                  </div>
                  <p className="text-center text-[12px] font-medium text-slate-500">
                    剪辑中 {stageProgress.editing}%
                  </p>
                </div>
              ) : null}
            </div>
          </section>
        )}

    </VideoWorkflowPage>
  )
}
