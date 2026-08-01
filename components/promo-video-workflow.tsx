"use client"

/**
 * 宣传视频创作工作流
 * ─────────────────────────────────────────
 * 工作区归属：你（宣传视频）
 * 勿改：share-distribute.tsx / account-binding.tsx / lib/video/storage.ts 的 ShareVideo 逻辑
 * 合并触点：app/page.tsx 仅保留一行路由；sidebar 已注册「宣传视频」子项
 */

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ImageIcon,
  ArrowLeft,
  Sparkles,
  Wand2,
  Package,
  AlertCircle,
  Mic,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { resolveMediaUrl, fileToBase64 } from "@/lib/video/utils"
import { VideoCoverSettings } from "@/components/video-cover-settings"
import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import { startCoverGeneration } from "@/lib/video/cover-runtime"
import { PreviewVideoCoverPanel } from "@/components/video/preview-video-cover-panel"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import type { AssetRef } from "@/lib/workflow-draft-store"
import {
  clearDraft,
  defaultPromoVideoDraft,
  loadDraft,
  saveDraft,
} from "@/lib/workflow-draft-store"
import {
  blobToDataUrl,
  clearWorkflowAssets,
  getWorkflowAsset,
  newAssetId,
  putWorkflowAsset,
} from "@/lib/workflow-asset-store"
import {
  VideoWorkflowPage,
  WorkflowHero,
  WorkflowStepIndicator,
  UploadZone,
  type WorkflowStepId,
  type WorkflowStepStatus,
} from "@/components/video-workflow-shell"
import {
  PROMO_DURATIONS,
  PROMO_RATIOS,
  PROMO_STEP_LABELS,
  PROMO_ACCEPTED_AUDIO,
  PROMO_MAX_AUDIO_SIZE,
  PROMO_RH_CHANNELS,
  PROMO_RH_IMAGE_MODES,
  PROMO_RH_INSTANCE_TYPES,
  PROMO_RH_FRAME_COUNTS,
  PROMO_VIDEO_RESOLUTIONS,
  promoResolutionsForChannel,
  estimatePromoVideoCost,
  type PromoFrameCount,
  type PromoRhChannel,
  type PromoRhResolution,
  type PromoRhImageMode,
  type PromoRhInstanceType,
  type PromoVideoResolution,
} from "@/lib/promo-video/constants"
import {
  submitPromoStoryboard,
  queryPromoStoryboardStatus,
  requestPromoAutoPrompt,
  submitPromoVideo,
  retryPromoCrop,
  formatPromoError,
} from "@/lib/promo-video/api"

type Step = "form" | "storyboard" | "prompt" | "video"

interface FormData {
  productPrompt: string
  promoScript: string
  productImage: string
  audioBase64: string
  duration: number
  frameCount: PromoFrameCount
  ratio: string
  channel: PromoRhChannel
  resolution: PromoRhResolution
  imageMode: PromoRhImageMode
  instanceType: PromoRhInstanceType
}

interface AudioSample {
  name: string
  base64: string
}

const STEP_KEYS: Step[] = ["form", "storyboard", "prompt", "video"]
const ACCENT = "sky" as const

function stepIndex(step: Step): number {
  return STEP_KEYS.indexOf(step)
}

function buildPromoSteps(
  step: Step,
  sbStatus: "idle" | "queue" | "proc" | "ready" | "fail",
  vidStatus: "idle" | "queue" | "proc" | "done" | "fail",
): { id: WorkflowStepId; label: string; status: WorkflowStepStatus }[] {
  const current = stepIndex(step) + 1
  return PROMO_STEP_LABELS.map(({ id, label }) => {
    if (id < current) return { id, label, status: "done" as const }
    if (id > current) return { id, label, status: "pending" as const }

    if (step === "storyboard") {
      if (sbStatus === "fail") return { id, label, status: "error" as const }
      if (sbStatus === "queue" || sbStatus === "proc") return { id, label, status: "loading" as const }
      if (sbStatus === "ready") return { id, label, status: "done" as const }
      return { id, label, status: "active" as const }
    }
    if (step === "video") {
      if (vidStatus === "fail") return { id, label, status: "error" as const }
      if (vidStatus === "queue" || vidStatus === "proc") return { id, label, status: "loading" as const }
      if (vidStatus === "done") return { id, label, status: "done" as const }
      return { id, label, status: "active" as const }
    }
    return { id, label, status: "active" as const }
  })
}

const selectClass =
  "w-full rounded-lg border border-slate-200/80 bg-white px-2.5 py-1.5 text-[12px] text-slate-700 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"

const fieldLabelClass = "mb-1 block text-[11px] font-medium text-slate-500"

export default function PromoVideoWorkflow() {
  const runtimeApi = useTaskRuntimeApi()
  const runtimeTask = useRuntimeTask("promo-video")
  const toastedRef = useRef("")
  const [step, setStep] = useState<Step>("form")
  const [formData, setFormData] = useState<FormData>({
    productPrompt: "",
    promoScript: "",
    productImage: "",
    audioBase64: "",
    duration: 15,
    frameCount: 9,
    ratio: "adaptive",
    channel: "Third-party",
    resolution: "2k",
    imageMode: "2",
    instanceType: "default",
  })
  const [imagePreview, setImagePreview] = useState("")
  const [audioSample, setAudioSample] = useState<AudioSample | null>(null)

  const [storyTaskId, setStoryTaskId] = useState("")
  const [sbStatus, setSbStatus] = useState<"idle" | "queue" | "proc" | "ready" | "fail">("idle")
  const [sbProgress, setSbProgress] = useState(0)
  const [sbStageLabel, setSbStageLabel] = useState("")
  const [sbRhTaskId, setSbRhTaskId] = useState("")
  const [sbRhCropTaskId, setSbRhCropTaskId] = useState("")
  const [sbFrameCount, setSbFrameCount] = useState(0)
  const [sbFailedStage, setSbFailedStage] = useState("")
  const [frames, setFrames] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sbErr, setSbErr] = useState("")
  const [retryCropping, setRetryCropping] = useState(false)

  const [videoTaskId, setVideoTaskId] = useState("")
  const [vidStatus, setVidStatus] = useState<"idle" | "queue" | "proc" | "done" | "fail">("idle")
  const [vidProgress, setVidProgress] = useState(0)
  const [vidUrl, setVidUrl] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [coverStatus, setCoverStatus] = useState<"idle" | "running" | "success" | "failed">("idle")
  const [coverError, setCoverError] = useState("")
  const [vidErr, setVidErr] = useState("")
  const [vidPrompt, setVidPrompt] = useState("")
  const [autoPrompting, setAutoPrompting] = useState(false)
  const [videoResolution, setVideoResolution] = useState<PromoVideoResolution>("720p")
  const [videoRatio, setVideoRatio] = useState("adaptive")
  const [realPersonMode, setRealPersonMode] = useState(true)
  const [videoInstanceType, setVideoInstanceType] = useState<PromoRhInstanceType>("default")
  const [vidRhTaskIds, setVidRhTaskIds] = useState<string[]>([])
  const [vidSegmentCount, setVidSegmentCount] = useState(0)
  const [vidSegmentsCompleted, setVidSegmentsCompleted] = useState(0)
  const [draftHydrating, setDraftHydrating] = useState(true)
  const [imageRef, setImageRef] = useState<AssetRef | null>(null)
  const [audioRef, setAudioRef] = useState<AssetRef | null>(null)
  const [coverAspectRatio, setCoverAspectRatio] = useState<CoverAspectRatio>(DEFAULT_COVER_ASPECT_RATIO)
  const [coverResolution, setCoverResolution] = useState<CoverResolution>(DEFAULT_COVER_RESOLUTION)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = loadDraft("promo-video") ?? defaultPromoVideoDraft()
      if (cancelled) return
      setStep(draft.step as Step)
      setFormData({
        productPrompt: draft.formData.productPrompt,
        promoScript: draft.formData.promoScript,
        productImage: "",
        audioBase64: "",
        duration: draft.formData.duration,
        frameCount: draft.formData.frameCount as PromoFrameCount,
        ratio: draft.formData.ratio,
        channel: draft.formData.channel as PromoRhChannel,
        resolution: draft.formData.resolution as PromoRhResolution,
        imageMode: draft.formData.imageMode as PromoRhImageMode,
        instanceType: draft.formData.instanceType as PromoRhInstanceType,
      })
      setStoryTaskId(draft.storyTaskId)
      setSbStatus(draft.sbStatus as typeof sbStatus)
      setSbProgress(draft.sbProgress)
      setSbStageLabel(draft.sbStageLabel)
      setVideoTaskId(draft.videoTaskId)
      setVidStatus(draft.vidStatus as typeof vidStatus)
      setVidProgress(draft.vidProgress)
      setVidUrl(draft.videoUrl)
      setImageRef(draft.imageRef)
      setAudioRef(draft.audioRef)
      setCoverAspectRatio(draft.coverAspectRatio ?? DEFAULT_COVER_ASPECT_RATIO)
      setCoverResolution(draft.coverResolution ?? DEFAULT_COVER_RESOLUTION)
      if (draft.imageRef) {
        const stored = await getWorkflowAsset(draft.imageRef.id)
        if (stored) {
          const preview = await blobToDataUrl(stored.blob)
          setImagePreview(preview)
          const base64 = await fileToBase64(new File([stored.blob], stored.name, { type: stored.mime }))
          setFormData((p) => ({ ...p, productImage: base64 }))
        }
      }
      if (draft.audioRef) {
        const stored = await getWorkflowAsset(draft.audioRef.id)
        if (stored) {
          const base64 = await fileToBase64(new File([stored.blob], stored.name, { type: stored.mime }))
          setAudioSample({ name: stored.name, base64 })
          setFormData((p) => ({ ...p, audioBase64: base64 }))
        }
      }
      setDraftHydrating(false)
    })()
    return () => { cancelled = true }
  }, [])

  // 草稿恢复为「分镜就绪」但内存无帧 URL 时，从后端（含磁盘恢复）重新拉取
  useEffect(() => {
    if (draftHydrating || sbStatus !== "ready" || !storyTaskId || frames.length > 0) return
    let cancelled = false
    void (async () => {
      try {
        const sd = await queryPromoStoryboardStatus(storyTaskId)
        if (cancelled) return
        if (sd.status === "storyboard_ready" && (sd.frame_urls?.length ?? 0) > 0) {
          setFrames(sd.frame_urls!)
          setSbFrameCount(sd.frame_count || sd.frame_urls!.length)
          return
        }
        setSbStatus("fail")
        setSbErr(formatPromoError(sd.error || "分镜图未找到，请重新生成分镜"))
      } catch (e: unknown) {
        if (cancelled) return
        setSbStatus("fail")
        setSbErr(formatPromoError(e instanceof Error ? e.message : "分镜任务已失效，请重新生成"))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [draftHydrating, sbStatus, storyTaskId, frames.length])

  useEffect(() => {
    if (draftHydrating) return
    saveDraft("promo-video", {
      step,
      formData: {
        productPrompt: formData.productPrompt,
        promoScript: formData.promoScript,
        duration: formData.duration,
        frameCount: formData.frameCount,
        ratio: formData.ratio,
        channel: formData.channel,
        resolution: formData.resolution,
        imageMode: formData.imageMode,
        instanceType: formData.instanceType,
      },
      storyTaskId,
      sbStatus,
      sbProgress,
      sbStageLabel,
      videoTaskId,
      vidStatus,
      vidProgress,
      vidStageLabel: "",
      videoUrl: vidUrl,
      imageRef,
      audioRef,
      coverAspectRatio,
      coverResolution,
    })
  }, [
    draftHydrating,
    step,
    formData,
    coverAspectRatio,
    coverResolution,
    storyTaskId,
    sbStatus,
    sbProgress,
    sbStageLabel,
    videoTaskId,
    vidStatus,
    vidProgress,
    vidUrl,
    imageRef,
    audioRef,
  ])

  const availableResolutions = promoResolutionsForChannel(formData.channel)
  const videoSegmentCount = Math.max(1, Math.floor((formData.duration + 14) / 15))
  const estimatedCost = estimatePromoVideoCost(formData.duration, videoResolution)

  // 从全局 runtime 同步分镜 / 成片进度
  useEffect(() => {
    if (!runtimeTask) return
    const phase = String(runtimeTask.meta?.phase ?? "video")

    if (phase === "storyboard") {
      setStoryTaskId(runtimeTask.taskId)
      setSbProgress(runtimeTask.progress)
      setSbStageLabel(runtimeTask.stageLabel || "")
      if (runtimeTask.result?.rhTaskId) setSbRhTaskId(String(runtimeTask.result.rhTaskId))
      if (runtimeTask.result?.rhCropTaskId) setSbRhCropTaskId(String(runtimeTask.result.rhCropTaskId))
      if (runtimeTask.result?.frameCount) setSbFrameCount(Number(runtimeTask.result.frameCount))
      if (runtimeTask.result?.failedStage) setSbFailedStage(String(runtimeTask.result.failedStage))

      if (runtimeTask.status === "running") {
        setStep("storyboard")
        setSbStatus("proc")
        setSbErr("")
        return
      }
      if (runtimeTask.status === "success") {
        const frameUrls = Array.isArray(runtimeTask.result?.frames)
          ? (runtimeTask.result!.frames as string[])
          : []
        setSbStatus("ready")
        setFrames(frameUrls)
        setVidPrompt(formData.promoScript.trim())
        setStep("storyboard")
        return
      }
      if (runtimeTask.status === "failed") {
        setSbStatus("fail")
        setSbErr(formatPromoError(runtimeTask.error || "分镜生成失败"))
        setStep("storyboard")
      }
      return
    }

    // video phase
    setVideoTaskId(runtimeTask.taskId)
    setVidProgress(runtimeTask.progress)
    if (Array.isArray(runtimeTask.result?.rhTaskIds)) {
      setVidRhTaskIds(runtimeTask.result!.rhTaskIds as string[])
    }
    if (typeof runtimeTask.result?.segmentCount === "number") {
      setVidSegmentCount(runtimeTask.result.segmentCount as number)
    }
    if (typeof runtimeTask.result?.segmentsCompleted === "number") {
      setVidSegmentsCompleted(runtimeTask.result.segmentsCompleted as number)
    }

    const nextCoverUrl = String(runtimeTask.result?.coverUrl ?? "")
    const metaCoverStatus = String(runtimeTask.meta?.coverStatus ?? "")
    if (nextCoverUrl) {
      setCoverUrl(nextCoverUrl)
      setCoverStatus("success")
      setCoverError("")
    } else if (metaCoverStatus === "running" || metaCoverStatus === "failed") {
      setCoverStatus(metaCoverStatus)
      if (metaCoverStatus === "failed") {
        setCoverError(String(runtimeTask.meta?.coverError ?? "封面生成失败"))
      }
    } else if (metaCoverStatus === "success" && !nextCoverUrl) {
      setCoverStatus("success")
    }

    if (runtimeTask.status === "running") {
      setStep("video")
      setVidStatus("proc")
      setVidErr("")
      return
    }
    if (runtimeTask.status === "success") {
      const url = String(runtimeTask.result?.videoUrl ?? "")
      setStep("video")
      setVidStatus("done")
      setVidUrl(url)
      if (toastedRef.current !== runtimeTask.taskId) {
        toastedRef.current = runtimeTask.taskId
        toast({ title: "宣传视频生成成功！" })
      }
      return
    }
    if (runtimeTask.status === "failed") {
      setStep("video")
      setVidStatus("fail")
      setVidErr(formatPromoError(runtimeTask.error || "视频生成失败"))
    }
  }, [runtimeTask, formData.promoScript])

  const handleImage = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast({ title: "请上传图片文件", variant: "destructive" })
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      setImagePreview(e.target!.result as string)
    }
    reader.readAsDataURL(file)
    const base64 = await fileToBase64(file)
    const id = newAssetId("promo_img")
    const put = await putWorkflowAsset({
      id,
      workflow: "promo-video",
      name: file.name,
      mime: file.type || "image/png",
      kind: "image",
      blob: file,
    })
    if (put.ok) {
      setImageRef({ id, name: file.name, mime: file.type, size: file.size, kind: "image" })
    }
    setFormData((p) => ({ ...p, productImage: base64 }))
  }, [])

  const handleAudio = useCallback(async (file: File) => {
    if (file.size > PROMO_MAX_AUDIO_SIZE) {
      toast({ title: "音频文件超过 20MB 限制", variant: "destructive" })
      return
    }
    const base64 = await fileToBase64(file)
    const id = newAssetId("promo_audio")
    const put = await putWorkflowAsset({
      id,
      workflow: "promo-video",
      name: file.name,
      mime: file.type || "audio/mpeg",
      kind: "audio",
      blob: file,
    })
    if (put.ok) {
      setAudioRef({ id, name: file.name, mime: file.type, size: file.size, kind: "audio" })
    }
    setAudioSample({ name: file.name, base64 })
    setFormData((p) => ({ ...p, audioBase64: base64 }))
  }, [])

  const startStoryboardPoll = useCallback(
    (tid: string) => {
      runtimeApi.register({
        kind: "promo-video",
        taskId: tid,
        progress: 5,
        stageLabel: "分镜生成中",
        meta: {
          phase: "storyboard",
          frameCount: formData.frameCount,
          script: formData.promoScript.trim(),
          skipHistory: true,
        },
      })
    },
    [runtimeApi, formData.frameCount, formData.promoScript],
  )

  const submitStory = async () => {
    const isImageMode = formData.imageMode === "2"
    if (isImageMode && !formData.productImage) {
      toast({ title: "图生图模式请上传产品图片", variant: "destructive" })
      return
    }
    if (!formData.productPrompt.trim()) {
      toast({ title: "请填写产品提示词", variant: "destructive" })
      return
    }
    if (!formData.promoScript.trim()) {
      toast({ title: "请填写宣传文案", variant: "destructive" })
      return
    }

    setStep("storyboard")
    setSbStatus("queue")
    setSbProgress(0)
    setSbStageLabel("")
    setSbRhTaskId("")
    setSbRhCropTaskId("")
    setSbFrameCount(formData.frameCount)
    setSbFailedStage("")
    setSbErr("")

    try {
      const payload: Parameters<typeof submitPromoStoryboard>[0] = {
        product_prompt: formData.productPrompt.trim(),
        promo_script: formData.promoScript.trim(),
        duration: formData.duration,
        frame_count: formData.frameCount,
        ratio: formData.ratio,
        channel: formData.channel,
        resolution: formData.resolution,
        image_mode: formData.imageMode,
        instance_type: formData.instanceType,
      }
      if (isImageMode && formData.productImage) {
        payload.product_image = formData.productImage
      }
      if (formData.audioBase64) {
        payload.audio_base64 = formData.audioBase64
      }
      const { task_id: tid } = await submitPromoStoryboard(payload)
      setStoryTaskId(tid)
      setSbStatus("proc")
      startStoryboardPoll(tid)
    } catch (e: unknown) {
      setSbStatus("fail")
      setSbErr(formatPromoError(e instanceof Error ? e.message : "网络错误"))
    }
  }

  const retryCrop = async () => {
    if (!storyTaskId) return
    setRetryCropping(true)
    setSbStatus("proc")
    setSbErr("")
    setSbFailedStage("")
    setSbProgress(0)
    setSbStageLabel("重新裁切分镜图…")
    try {
      await retryPromoCrop(storyTaskId)
      startStoryboardPoll(storyTaskId)
    } catch (e: unknown) {
      setSbStatus("fail")
      setSbErr(formatPromoError(e instanceof Error ? e.message : "裁切重试失败"))
    } finally {
      setRetryCropping(false)
    }
  }

  const canRetryCrop =
    sbStatus === "fail" &&
    !!storyTaskId &&
    (sbFailedStage === "pv_crop_download" ||
      sbFailedStage === "pv_crop" ||
      sbFailedStage === "pv_rh_crop_submit" ||
      sbFailedStage === "pv_rh_crop_poll" ||
      sbFailedStage === "pv_download")

  const toggle = (i: number) =>
    setSelected((p) => {
      const n = new Set(p)
      n.has(i) ? n.delete(i) : n.add(i)
      return n
    })

  const autoPrompt = async () => {
    if (!formData.promoScript.trim()) {
      toast({ title: "请先填写宣传文案", variant: "destructive" })
      return
    }
    setAutoPrompting(true)
    try {
      const d = await requestPromoAutoPrompt({
        promo_script: formData.promoScript,
        duration: formData.duration,
        selected_count: selected.size || 1,
        visual_style: formData.productPrompt.trim() || undefined,
        has_audio_ref: Boolean(formData.audioBase64),
      })
      if (d.prompt) setVidPrompt(d.prompt)
      toast({ title: "提示词已生成" })
    } catch (e: unknown) {
      toast({
        title: "AI 生成失败",
        description: e instanceof Error ? e.message : "请稍后重试",
        variant: "destructive",
      })
    } finally {
      setAutoPrompting(false)
    }
  }

  const submitVideo = async () => {
    if (selected.size === 0) {
      toast({ title: "请至少选择一个分镜", variant: "destructive" })
      return
    }
    if (!vidPrompt.trim()) {
      toast({ title: "请输入视频提示词", variant: "destructive" })
      return
    }

    setStep("video")
    setVidStatus("queue")
    setVidProgress(0)
    setVidErr("")
    setCoverUrl("")
    setCoverError("")
    setCoverStatus("idle")

    try {
      const { task_id: tid } = await submitPromoVideo({
        storyboard_task_id: storyTaskId,
        selected_indices: Array.from(selected).sort((a, b) => a - b),
        video_prompt: vidPrompt,
        duration: formData.duration,
        promo_script: formData.promoScript,
        video_resolution: videoResolution,
        real_person_mode: realPersonMode,
        ratio: videoRatio,
      })
      setVideoTaskId(tid)
      setVidSegmentCount(videoSegmentCount)
      setVidSegmentsCompleted(0)
      setVidRhTaskIds([])
      setVidStatus("proc")
      const coverRef = formData.productImage
        ? { base64: formData.productImage }
        : imagePreview
          ? { dataUrl: imagePreview }
          : frames[0]
            ? { url: resolveMediaUrl(frames[0]) }
            : null
      setCoverStatus(coverRef ? "running" : "idle")
      runtimeApi.register({
        kind: "promo-video",
        taskId: tid,
        progress: 5,
        stageLabel: "视频生成中",
        meta: {
          phase: "video",
          script: formData.promoScript.slice(0, 80),
        },
      })
      startCoverGeneration({
        kind: "promo-video",
        script: formData.promoScript.trim(),
        referenceImage: coverRef,
        aspectRatio: coverAspectRatio,
        resolution: coverResolution,
        linkedTaskId: tid,
      })
    } catch (e: unknown) {
      setVidStatus("fail")
      setVidErr(e instanceof Error ? e.message : "网络错误")
    }
  }

  const reset = () => {
    setStep("form")
    setSbStatus("idle")
    setFrames([])
    setSelected(new Set())
    setVidStatus("idle")
    setVidUrl("")
    setCoverUrl("")
    setCoverStatus("idle")
    setCoverError("")
    setVidProgress(0)
    setVidErr("")
    setVidPrompt("")
    setVideoResolution("720p")
    setVideoRatio("adaptive")
    setRealPersonMode(true)
    setVideoInstanceType("default")
    setVidRhTaskIds([])
    setVidSegmentCount(0)
    setVidSegmentsCompleted(0)
    setStoryTaskId("")
    setVideoTaskId("")
    setAudioSample(null)
  }

  const promoSteps = buildPromoSteps(step, sbStatus, vidStatus)

  return (
    <VideoWorkflowPage compact>
      <div data-tutorial-id="promo-video-workflow">
      <WorkflowHero
        compact
        accentColor={ACCENT}
        title="AI"
        accentWord="宣传视频"
        description="上传宣传文案与分镜参数，AI 生成分镜图、提示词，一键合成品牌宣传短片"
      />

      <div className="mb-3">
        <WorkflowStepIndicator accentColor={ACCENT} steps={promoSteps} />
      </div>

      {/* Step 1 — 上传素材（横向紧凑一屏） */}
      {step === "form" && (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-500/10">
                <Package className="h-4 w-4 text-sky-400" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">上传素材</h2>
                <p className="text-[11px] text-slate-400">配置分镜参数与成片设置</p>
              </div>
            </div>
            <Button
              onClick={submitStory}
              size="sm"
              className="shrink-0 rounded-full bg-sky-500 px-4 text-white hover:bg-sky-600"
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              开始生成分镜图
            </Button>
          </div>

          <div className="space-y-3">
            {/* 上行：双栏文案 */}
            <div className="grid gap-3 lg:grid-cols-2">
              <div>
                <label className={fieldLabelClass}>
                  产品提示词 <span className="text-sky-500">*</span>
                  <span className="ml-1.5 font-normal text-slate-400">{formData.productPrompt.length} 字</span>
                </label>
                <textarea
                  placeholder="用于 AI 绘制分镜九宫格，描述画面风格与产品场景…（系统自动追加：不要生成分镜编号文字）"
                  value={formData.productPrompt}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, productPrompt: e.target.value }))
                  }
                  className={cn(selectClass, "min-h-[72px] resize-none leading-relaxed")}
                />
              </div>
              <div>
                <label className={fieldLabelClass}>
                  宣传文案 <span className="text-sky-500">*</span>
                  <span className="ml-1.5 font-normal text-slate-400">
                    {formData.promoScript.length} 字 · 成片叙事
                  </span>
                </label>
                <textarea
                  placeholder="描述运镜、节奏、卖点叙述…"
                  value={formData.promoScript}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, promoScript: e.target.value }))
                  }
                  className={cn(selectClass, "min-h-[72px] resize-none leading-relaxed")}
                />
              </div>
            </div>

            {/* 中行：素材 + 成片计费 */}
            <div className="grid gap-3 lg:grid-cols-3">
              {/* 生成模式 + 产品图 */}
              <div className="space-y-2 rounded-xl border border-sky-100/80 bg-sky-50/30 p-3 dark:border-sky-500/10 dark:bg-sky-500/5">
                <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">分镜素材</p>
                <div className="flex gap-1.5">
                  {PROMO_RH_IMAGE_MODES.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => {
                        setFormData((p) => ({
                          ...p,
                          imageMode: m.value,
                          ...(m.value === "1" ? { productImage: "" } : {}),
                        }))
                        if (m.value === "1") setImagePreview("")
                      }}
                      className={cn(
                        "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                        formData.imageMode === m.value
                          ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                          : "border-slate-200/80 bg-white text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                {formData.imageMode === "2" && (
                  imagePreview ? (
                    <div className="relative flex h-14 items-center gap-2 overflow-hidden rounded-xl border border-slate-200/60 bg-white px-2 dark:border-white/10 dark:bg-white/5">
                      <img
                        src={imagePreview}
                        alt="产品预览"
                        className="h-10 w-10 shrink-0 rounded-md object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate text-[11px] text-slate-600 dark:text-slate-300">
                        已上传产品图
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview("")
                          setFormData((p) => ({ ...p, productImage: "" }))
                        }}
                        className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 dark:bg-white/5"
                      >
                        更换
                      </button>
                    </div>
                  ) : (
                    <UploadZone
                      compact
                      accept="image/*"
                      label="上传产品图片"
                      icon={ImageIcon}
                      hint="JPG / PNG / WebP"
                      onFile={handleImage}
                      accentColor={ACCENT}
                    />
                  )
                )}
                {formData.imageMode === "1" && (
                  <p className="text-[10px] leading-snug text-slate-400">文生图模式无需上传产品图</p>
                )}
              </div>

              {/* 参考音色 */}
              <div className="space-y-2 rounded-xl border border-slate-200/60 p-3 dark:border-white/10">
                <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                  参考音色
                  <span className="ml-1.5 font-normal text-slate-400">可选</span>
                </p>
                {audioSample ? (
                  <div className="flex h-14 items-center gap-2 rounded-xl border border-slate-200/60 bg-white px-3 dark:border-white/10 dark:bg-white/5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-500/10">
                      <Mic className="h-4 w-4 text-sky-400" />
                    </span>
                    <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-700 dark:text-slate-300">
                      {audioSample.name}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setAudioSample(null)
                        setFormData((p) => ({ ...p, audioBase64: "" }))
                      }}
                      className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 hover:bg-slate-200 dark:bg-white/5"
                    >
                      移除
                    </button>
                  </div>
                ) : (
                  <UploadZone
                    compact
                    accentColor={ACCENT}
                    accept={PROMO_ACCEPTED_AUDIO}
                    label="上传参考音色"
                    icon={Mic}
                    hint="MP3 / WAV / M4A · 10~30 秒"
                    onFile={(f) => { void handleAudio(f) }}
                  />
                )}
              </div>

              <VideoCoverSettings
                accent="sky"
                aspectRatio={coverAspectRatio}
                resolution={coverResolution}
                onAspectRatioChange={setCoverAspectRatio}
                onResolutionChange={setCoverResolution}
              />

              {/* 成片计费 */}
              <div className="space-y-2 rounded-xl border border-amber-100/80 bg-amber-50/40 p-3 dark:border-amber-500/10 dark:bg-amber-500/5">
                <p className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">成片设置 · 积分</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={fieldLabelClass}>时长</label>
                    <select
                      value={formData.duration}
                      onChange={(e) => setFormData((p) => ({ ...p, duration: Number(e.target.value) }))}
                      className={selectClass}
                    >
                      {PROMO_DURATIONS.map((d) => (
                        <option key={d} value={d}>{d}s</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClass}>视频分辨率</label>
                    <select
                      value={videoResolution}
                      onChange={(e) => setVideoResolution(e.target.value as PromoVideoResolution)}
                      className={selectClass}
                    >
                      {PROMO_VIDEO_RESOLUTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={fieldLabelClass}>画面比例</label>
                    <select
                      value={formData.ratio}
                      onChange={(e) => {
                        const v = e.target.value
                        setFormData((p) => ({ ...p, ratio: v }))
                        setVideoRatio(v)
                      }}
                      className={selectClass}
                    >
                      {PROMO_RATIOS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className="rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] text-slate-600 dark:bg-black/20 dark:text-slate-300">
                  预计消耗{" "}
                  <span className="font-semibold text-amber-700 dark:text-amber-300">
                    {estimatedCost.toLocaleString()}
                  </span>{" "}
                  积分
                  <span className="ml-1 text-slate-400">
                    （{videoResolution} · {formData.duration} 秒 · {videoSegmentCount} 段）
                  </span>
                </p>
              </div>
            </div>

            {/* 下行：分镜参数带 */}
            <div className="rounded-xl border border-slate-200/60 p-3 dark:border-white/10">
              <p className="mb-2 text-[11px] font-semibold text-slate-700 dark:text-slate-300">分镜参数</p>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-5">
                <div>
                  <label className={fieldLabelClass}>分镜宫格</label>
                  <select
                    value={formData.frameCount}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        frameCount: Number(e.target.value) as PromoFrameCount,
                      }))
                    }
                    className={selectClass}
                  >
                    {PROMO_RH_FRAME_COUNTS.map((n) => (
                      <option key={n.value} value={n.value}>{n.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelClass}>生成路线</label>
                  <select
                    value={formData.channel}
                    onChange={(e) => {
                      const ch = e.target.value as PromoRhChannel
                      setFormData((p) => {
                        const next = { ...p, channel: ch }
                        if (ch !== "Official" && p.resolution === "8k") {
                          next.resolution = "2k"
                        }
                        return next
                      })
                    }}
                    className={selectClass}
                  >
                    {PROMO_RH_CHANNELS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelClass}>分镜分辨率</label>
                  <select
                    value={formData.resolution}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        resolution: e.target.value as PromoRhResolution,
                      }))
                    }
                    className={selectClass}
                  >
                    {availableResolutions.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelClass}>分镜算力</label>
                  <select
                    value={formData.instanceType}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        instanceType: e.target.value as PromoRhInstanceType,
                      }))
                    }
                    className={selectClass}
                  >
                    {PROMO_RH_INSTANCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className={fieldLabelClass}>成片算力</label>
                  <select
                    value={videoInstanceType}
                    onChange={(e) => setVideoInstanceType(e.target.value as PromoRhInstanceType)}
                    className={selectClass}
                  >
                    {PROMO_RH_INSTANCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 2 — 分镜 */}
      {step === "storyboard" && (
        <div className="mx-auto max-w-3xl space-y-6">
          {(sbStatus === "queue" || sbStatus === "proc") && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white py-16 dark:border-white/10 dark:bg-white/5">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-sky-400" />
              <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
                {sbStageLabel || "正在生成分镜图…"}
              </h3>
              <p className="mb-2 text-[13px] text-slate-500">
                {sbStageLabel ? "分镜管线进行中" : "AI 根据产品信息规划镜头并绘制分镜"}
              </p>
              {(sbRhTaskId || sbRhCropTaskId) && (
                <div className="mb-4 max-w-md space-y-1 text-center font-mono text-[11px] text-slate-400">
                  {sbRhTaskId && <p className="break-all">分镜 taskId: {sbRhTaskId}</p>}
                  {sbRhCropTaskId && <p className="break-all">裁切 taskId: {sbRhCropTaskId}</p>}
                </div>
              )}
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min(sbProgress, 99)}%` }}
                />
              </div>
              {sbProgress > 0 && (
                <p className="mt-3 text-[12px] text-slate-400">{sbProgress}%</p>
              )}
            </div>
          )}

          {sbStatus === "ready" && (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-100">选择分镜</h2>
                  <p className="text-[12px] text-slate-400">点击选择要用于成片的镜头</p>
                </div>
                <span className="rounded-full bg-sky-50 px-3 py-1 text-[12px] font-medium text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
                  已选 {selected.size} / {sbFrameCount || frames.length}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {frames.map((url, i) => {
                  const full = resolveMediaUrl(url)
                  const isSel = selected.has(i)
                  return (
                    <button
                      key={i}
                      type="button"
                      onClick={() => toggle(i)}
                      className={cn(
                        "group relative aspect-[3/4] overflow-hidden rounded-xl border-2 transition-all",
                        isSel
                          ? "border-sky-500 ring-2 ring-sky-500/25"
                          : "border-slate-200 hover:border-sky-300 dark:border-white/10",
                      )}
                    >
                      <img src={full} alt={`分镜 ${i + 1}`} className="h-full w-full object-cover" />
                      {isSel && (
                        <div className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-2">
                        <span className="text-[10px] font-medium text-white">#{i + 1}</span>
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSbStatus("idle")
                    setStep("form")
                  }}
                  className="flex-1 rounded-full"
                >
                  重新填写
                </Button>
                <Button
                  onClick={() => {
                    setVideoRatio(formData.ratio)
                    void autoPrompt()
                    setStep("prompt")
                  }}
                  disabled={selected.size === 0}
                  className="flex-1 rounded-full bg-sky-500 hover:bg-sky-600"
                >
                  下一步：编辑提示词
                </Button>
              </div>
            </>
          )}

          {sbStatus === "fail" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200/60 bg-red-50/30 py-16 dark:border-red-500/20 dark:bg-red-500/5">
              <XCircle className="mb-4 h-12 w-12 text-red-400" />
              <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">分镜生成失败</h3>
              <p className="mb-2 max-w-sm text-center text-[13px] text-slate-500">{sbErr}</p>
              {(sbFailedStage || sbRhTaskId || sbRhCropTaskId) && (
                <div className="mb-6 max-w-md space-y-1 text-center font-mono text-[11px] text-slate-400">
                  {sbFailedStage && <p>阶段: {sbFailedStage}</p>}
                  {sbRhTaskId && <p className="break-all">分镜 taskId: {sbRhTaskId}</p>}
                  {sbRhCropTaskId && <p className="break-all">裁切 taskId: {sbRhCropTaskId}</p>}
                </div>
              )}
              {!sbFailedStage && !sbRhTaskId && !sbRhCropTaskId && <div className="mb-6" />}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {canRetryCrop && (
                  <Button
                    onClick={() => void retryCrop()}
                    disabled={retryCropping}
                    className="rounded-full bg-amber-500 hover:bg-amber-600"
                  >
                    {retryCropping ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        重试裁切…
                      </>
                    ) : (
                      "重试裁切（无需重新生成）"
                    )}
                  </Button>
                )}
                <Button
                  onClick={() => {
                    setSbStatus("idle")
                    setStep("form")
                  }}
                  className="rounded-full bg-sky-500 hover:bg-sky-600"
                >
                  返回重试
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Step 3 — 提示词 */}
      {step === "prompt" && (
        <div className="rounded-2xl border border-slate-200/60 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 dark:bg-sky-500/10">
                <Wand2 className="h-4 w-4 text-sky-400" />
              </span>
              <div>
                <h2 className="text-[14px] font-semibold text-slate-800 dark:text-slate-100">视频提示词</h2>
                <p className="text-[11px] text-slate-400">
                  已选 {selected.size} 张分镜 · 可手动编辑或由 AI 自动生成
                </p>
              </div>
            </div>
            <p className="rounded-lg bg-amber-50 px-2.5 py-1 text-[11px] text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              预计 <span className="font-semibold">{estimatedCost.toLocaleString()}</span> 积分
              <span className="ml-1 text-amber-700/70 dark:text-amber-300/70">
                · {videoResolution} · {formData.duration}s · {videoSegmentCount} 段
              </span>
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_280px]">
            <textarea
              value={vidPrompt}
              onChange={(e) => setVidPrompt(e.target.value)}
              placeholder="描述镜头运动、氛围、转场节奏… 使用 Image1, Image2 引用分镜"
              className={cn(
                selectClass,
                "min-h-[160px] font-mono text-[12px] leading-relaxed lg:min-h-[200px]",
              )}
            />

            <div className="space-y-2 rounded-xl border border-sky-100/80 bg-sky-50/30 p-3 dark:border-sky-500/10 dark:bg-sky-500/5">
              <p className="text-[11px] font-semibold text-sky-700 dark:text-sky-300">视频生成设置</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={fieldLabelClass}>视频分辨率</label>
                  <select
                    value={videoResolution}
                    onChange={(e) => setVideoResolution(e.target.value as PromoVideoResolution)}
                    className={selectClass}
                  >
                    {PROMO_VIDEO_RESOLUTIONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelClass}>画面比例</label>
                  <select
                    value={videoRatio}
                    onChange={(e) => setVideoRatio(e.target.value)}
                    className={selectClass}
                  >
                    {PROMO_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={fieldLabelClass}>成片时长</label>
                  <select
                    value={formData.duration}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, duration: Number(e.target.value) }))
                    }
                    className={selectClass}
                  >
                    {PROMO_DURATIONS.map((d) => (
                      <option key={d} value={d}>{d} 秒</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-[12px] text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={realPersonMode}
                  onChange={(e) => setRealPersonMode(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                />
                真人模式
              </label>

              <p className="text-[11px] text-slate-500">
                {videoSegmentCount} 段 × 15 秒并发
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void autoPrompt()}
              disabled={autoPrompting}
              className="rounded-full"
            >
              {autoPrompting ? (
                <>
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  AI 生成中…
                </>
              ) : (
                <>
                  <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                  AI 自动生成
                </>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep("storyboard")}
              className="rounded-full"
            >
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
              返回选帧
            </Button>
            <Button
              onClick={() => void submitVideo()}
              size="sm"
              className="ml-auto rounded-full bg-sky-500 px-4 hover:bg-sky-600"
            >
              生成宣传视频 · {estimatedCost.toLocaleString()} 积分
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — 视频 */}
      {step === "video" && (
        <div className={cn("mx-auto space-y-6", vidStatus === "done" ? "max-w-4xl" : "max-w-2xl")}>
          {(vidStatus === "queue" || vidStatus === "proc") && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white py-16 dark:border-white/10 dark:bg-white/5">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-sky-400" />
              <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
                正在生成宣传视频
              </h3>
              <p className="mb-2 text-[13px] text-slate-500">
                {vidSegmentCount > 1
                  ? `正在生成第 ${Math.min(vidSegmentsCompleted + 1, vidSegmentCount)}/${vidSegmentCount} 段视频…`
                  : "预计 5–20 分钟，请耐心等待"}
              </p>
              {vidRhTaskIds.length > 0 && (
                <div className="mb-4 max-w-md space-y-1 text-center font-mono text-[11px] text-slate-400">
                  {vidRhTaskIds.map((id, i) => (
                    <p key={id} className="break-all">
                      段 {i + 1} taskId: {id}
                    </p>
                  ))}
                </div>
              )}
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min(vidProgress, 99)}%` }}
                />
              </div>
              {vidProgress > 0 && (
                <p className="mt-3 text-[12px] text-slate-400">{vidProgress}%</p>
              )}
              {coverStatus === "running" && (
                <p className="mt-3 text-[12px] text-slate-400">封面同步生成中…</p>
              )}
            </div>
          )}

          {vidStatus === "done" && vidUrl && (
            <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white px-4 py-10 dark:border-white/10 dark:bg-white/5 sm:px-6">
              <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
              <h3 className="mb-6 text-lg font-semibold text-slate-800 dark:text-slate-200">
                视频生成完成
              </h3>
              <div className="w-full">
                <PreviewVideoCoverPanel
                  videoUrl={vidUrl}
                  coverUrl={coverUrl}
                  coverStatus={coverStatus}
                  coverError={coverError}
                  onCreateNew={reset}
                />
              </div>
              <p className="mt-6 flex items-center gap-1.5 text-[12px] text-slate-400">
                <AlertCircle className="h-3.5 w-3.5" />
                完成后可在「历史记录」查看；一键分发由分发模块接入
              </p>
            </div>
          )}

          {vidStatus === "fail" && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-red-200/60 bg-red-50/30 py-16 dark:border-red-500/20 dark:bg-red-500/5">
              <XCircle className="mb-4 h-12 w-12 text-red-400" />
              <h3 className="mb-2 text-lg font-semibold text-red-600 dark:text-red-400">视频生成失败</h3>
              <p className="mb-6 max-w-sm text-center text-[13px] text-slate-500">{formatPromoError(vidErr)}</p>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setStep("prompt")
                    setVidStatus("idle")
                    setVidErr("")
                    setVideoTaskId("")
                  }}
                  className="rounded-full"
                >
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                  返回上一步
                </Button>
                <Button onClick={reset} className="rounded-full bg-sky-500 hover:bg-sky-600">
                  重新开始
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </VideoWorkflowPage>
  )
}
