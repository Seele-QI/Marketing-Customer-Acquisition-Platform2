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
  Download,
  Sparkles,
  Wand2,
  Package,
  AlertCircle,
  Mic,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { addHistoryRecord } from "@/components/video-history"
import { resolveMediaUrl, fileToBase64 } from "@/lib/video/utils"
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
  promoResolutionsForChannel,
  type PromoFrameCount,
  type PromoRhChannel,
  type PromoRhResolution,
  type PromoRhImageMode,
  type PromoRhInstanceType,
} from "@/lib/promo-video/constants"
import {
  submitPromoStoryboard,
  queryPromoStoryboardStatus,
  requestPromoAutoPrompt,
  submitPromoVideo,
  queryPromoVideoStatus,
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
  "w-full rounded-xl border border-slate-200/80 bg-white px-3 py-2.5 text-[13px] text-slate-700 outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20 dark:border-white/10 dark:bg-white/5 dark:text-slate-200"

export default function PromoVideoWorkflow() {
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
  const [vidErr, setVidErr] = useState("")
  const [vidPrompt, setVidPrompt] = useState("")
  const [autoPrompting, setAutoPrompting] = useState(false)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const pollFailCountRef = useRef(0)

  const availableResolutions = promoResolutionsForChannel(formData.channel)

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current) }, [])

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

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
    setFormData((p) => ({ ...p, productImage: base64 }))
  }, [])

  const handleAudio = useCallback(async (file: File) => {
    if (file.size > PROMO_MAX_AUDIO_SIZE) {
      toast({ title: "音频文件超过 20MB 限制", variant: "destructive" })
      return
    }
    const base64 = await fileToBase64(file)
    setAudioSample({ name: file.name, base64 })
    setFormData((p) => ({ ...p, audioBase64: base64 }))
  }, [])

  const startStoryboardPoll = useCallback((tid: string) => {
    stopPoll()
    pollFailCountRef.current = 0
    pollRef.current = setInterval(async () => {
      try {
        const sd = await queryPromoStoryboardStatus(tid)
        pollFailCountRef.current = 0
        setSbProgress(sd.progress || 0)
        if (sd.stage_label) setSbStageLabel(sd.stage_label)
        if (sd.rh_task_id) setSbRhTaskId(sd.rh_task_id)
        if (sd.rh_crop_task_id) setSbRhCropTaskId(sd.rh_crop_task_id)
        if (sd.frame_count) setSbFrameCount(sd.frame_count)
        if (sd.status === "storyboard_ready") {
          const frameUrls = sd.frame_urls || []
          const expected = sd.frame_count || formData.frameCount
          if (frameUrls.length === 0 || (expected > 0 && frameUrls.length !== expected)) {
            setSbStatus("fail")
            setSbFailedStage(sd.failed_stage || "pv_crop_download")
            setSbErr(formatPromoError("分镜图裁切失败，未生成有效分镜帧，请重试裁切或联系支持"))
            stopPoll()
            return
          }
          setSbStatus("ready")
          setFrames(frameUrls)
          setVidPrompt(formData.promoScript.trim())
          stopPoll()
        } else if (sd.status === "storyboard_failed") {
          setSbStatus("fail")
          setSbFailedStage(sd.failed_stage || sd.stage || "")
          if (sd.rh_task_id) setSbRhTaskId(sd.rh_task_id)
          if (sd.rh_crop_task_id) setSbRhCropTaskId(sd.rh_crop_task_id)
          setSbErr(formatPromoError(sd.error || "分镜生成失败"))
          stopPoll()
        }
      } catch (e) {
        pollFailCountRef.current += 1
        if (pollFailCountRef.current >= 5) {
          setSbStatus("fail")
          setSbErr(
            formatPromoError(
              e instanceof Error ? e.message : "网络错误，无法查询分镜状态",
            ),
          )
          stopPoll()
        }
      }
    }, 3000)
  }, [formData.promoScript])

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
    if (!storyTaskId) return
    setAutoPrompting(true)
    try {
      const d = await requestPromoAutoPrompt(storyTaskId, selected.size || 1)
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

    try {
      const { task_id: tid } = await submitPromoVideo({
        storyboard_task_id: storyTaskId,
        selected_indices: Array.from(selected),
        video_prompt: vidPrompt,
      })
      setVideoTaskId(tid)
      setVidStatus("proc")
      pollRef.current = setInterval(async () => {
        try {
          const vd = await queryPromoVideoStatus(tid)
          setVidProgress(vd.progress || 0)
          if (vd.status === "video_completed") {
            setVidStatus("done")
            const url = vd.video_url || ""
            setVidUrl(url)
            stopPoll()
            addHistoryRecord({
              id: tid,
              createdAt: Date.now(),
              script: formData.promoScript.slice(0, 80),
              videoUrl: url,
              coverUrl: frames[0] ? resolveMediaUrl(frames[0]) : "",
              source: "promo-video",
              status: "success",
            })
            toast({ title: "宣传视频生成成功！" })
          } else if (vd.status === "video_failed") {
            setVidStatus("fail")
            setVidErr(vd.error || "视频生成失败")
            stopPoll()
          }
        } catch {
          /* keep polling */
        }
      }, 5000)
    } catch (e: unknown) {
      setVidStatus("fail")
      setVidErr(e instanceof Error ? e.message : "网络错误")
    }
  }

  const reset = () => {
    stopPoll()
    setStep("form")
    setSbStatus("idle")
    setFrames([])
    setSelected(new Set())
    setVidStatus("idle")
    setVidUrl("")
    setVidProgress(0)
    setVidErr("")
    setVidPrompt("")
    setStoryTaskId("")
    setVideoTaskId("")
    setAudioSample(null)
  }

  const promoSteps = buildPromoSteps(step, sbStatus, vidStatus)

  return (
    <VideoWorkflowPage>
      <WorkflowHero
        accentColor={ACCENT}
        title="AI"
        accentWord="宣传视频"
        description="上传宣传文案与分镜参数，AI 生成分镜图、提示词，一键合成品牌宣传短片"
      />

      <div className="mb-8">
        <WorkflowStepIndicator accentColor={ACCENT} steps={promoSteps} />
      </div>

      {/* Step 1 — 上传素材 */}
      {step === "form" && (
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
                <Package className="h-5 w-5 text-sky-400" />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-100">上传素材</h2>
                <p className="text-[12px] text-slate-400">配置分镜参数与成片设置</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* 分镜生成设置 */}
              <div className="space-y-4 rounded-xl border border-sky-100/80 bg-sky-50/30 p-4 dark:border-sky-500/10 dark:bg-sky-500/5">
                <p className="text-[13px] font-semibold text-sky-700 dark:text-sky-300">分镜生成设置</p>

                <div>
                  <label className="mb-2 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    产品提示词 <span className="text-sky-500">*</span>
                    <span className="ml-2 text-[12px] font-normal text-slate-400">
                      {formData.productPrompt.length} 字
                    </span>
                  </label>
                  <textarea
                    placeholder="用于 AI 绘制分镜九宫格，描述画面风格与产品场景…&#10;例如：生成玉米生长过程产品广告分镜，写实摄影风格"
                    value={formData.productPrompt}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, productPrompt: e.target.value }))
                    }
                    className={cn(selectClass, "min-h-[80px] resize-y leading-relaxed")}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    宣传文案 <span className="text-sky-500">*</span>
                    <span className="ml-2 text-[12px] font-normal text-slate-400">
                      {formData.promoScript.length} 字 · 用于视频成片叙事提示词
                    </span>
                  </label>
                  <textarea
                    placeholder="描述运镜、节奏、卖点叙述…&#10;例如：从田间到餐桌，展现玉米新鲜甘甜的品质感。"
                    value={formData.promoScript}
                    onChange={(e) =>
                      setFormData((p) => ({ ...p, promoScript: e.target.value }))
                    }
                    className={cn(selectClass, "min-h-[100px] resize-y leading-relaxed")}
                  />
                </div>

                <div>
                  <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">生成模式</p>
                  <div className="flex gap-2">
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
                          "flex-1 rounded-xl border px-3 py-2.5 text-[13px] font-medium transition-colors",
                          formData.imageMode === m.value
                            ? "border-sky-500 bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                            : "border-slate-200/80 bg-white text-slate-600 hover:border-sky-300 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {formData.imageMode === "2" && (
                  <div>
                    <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">
                      产品图片 <span className="text-sky-500">*</span>
                    </p>
                    {imagePreview ? (
                      <div className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-slate-50 dark:border-white/10 dark:bg-white/5">
                        <img
                          src={imagePreview}
                          alt="产品预览"
                          className="mx-auto max-h-48 w-full object-contain p-4"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview("")
                            setFormData((p) => ({ ...p, productImage: "" }))
                          }}
                          className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white hover:bg-black/70"
                        >
                          更换
                        </button>
                      </div>
                    ) : (
                      <UploadZone
                        accept="image/*"
                        label="上传产品图片"
                        icon={ImageIcon}
                        hint="JPG / PNG / WebP，建议白底或场景图"
                        onFile={handleImage}
                        accentColor={ACCENT}
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">分镜宫格</label>
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
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">生成路线</label>
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
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">分镜分辨率</label>
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
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">算力实例</label>
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
                </div>
              </div>

              {/* 成片设置 */}
              <div className="space-y-4 rounded-xl border border-slate-200/60 p-4 dark:border-white/10">
                <p className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">成片设置</p>

                <div>
                  <p className="mb-2 text-[13px] font-medium text-slate-700 dark:text-slate-300">
                    参考音色
                    <span className="ml-2 text-[12px] font-normal text-slate-400">可选 · 10~30 秒 · MP3 / WAV / M4A</span>
                  </p>
                {audioSample ? (
                  <div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
                        <Mic className="h-5 w-5 text-sky-400" />
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[13px] font-medium text-slate-700 dark:text-slate-300">
                        {audioSample.name}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          setAudioSample(null)
                          setFormData((p) => ({ ...p, audioBase64: "" }))
                        }}
                        className="rounded-lg bg-slate-100 px-3 py-1 text-[11px] text-slate-500 hover:bg-slate-200 dark:bg-white/5"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                ) : (
                  <UploadZone
                    accentColor={ACCENT}
                    accept={PROMO_ACCEPTED_AUDIO}
                    label="上传参考音色"
                    icon={Mic}
                    hint="MP3 / WAV / M4A"
                    onFile={(f) => { void handleAudio(f) }}
                  />
                )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">视频时长</label>
                    <select
                      value={formData.duration}
                      onChange={(e) => setFormData((p) => ({ ...p, duration: Number(e.target.value) }))}
                      className={selectClass}
                    >
                      {PROMO_DURATIONS.map((d) => (
                        <option key={d} value={d}>{d} 秒</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-[12px] font-medium text-slate-500">画面比例</label>
                    <select
                      value={formData.ratio}
                      onChange={(e) => setFormData((p) => ({ ...p, ratio: e.target.value }))}
                      className={selectClass}
                    >
                      {PROMO_RATIOS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <Button
                onClick={submitStory}
                size="lg"
                className="mt-2 w-full rounded-full bg-sky-500 text-white hover:bg-sky-600"
              >
                <Sparkles className="mr-2 h-4 w-4" />
                开始生成分镜图
              </Button>
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
        <div className="mx-auto max-w-2xl">
          <div className="rounded-2xl border border-slate-200/60 bg-white p-6 shadow-sm dark:border-white/10 dark:bg-white/5 sm:p-8">
            <div className="mb-6 flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-50 dark:bg-sky-500/10">
                <Wand2 className="h-5 w-5 text-sky-400" />
              </span>
              <div>
                <h2 className="text-[16px] font-semibold text-slate-800 dark:text-slate-100">视频提示词</h2>
                <p className="text-[12px] text-slate-400">
                  已选 {selected.size} 张分镜 · 可手动编辑或由 AI 自动生成
                </p>
              </div>
            </div>

            <textarea
              value={vidPrompt}
              onChange={(e) => setVidPrompt(e.target.value)}
              placeholder="描述镜头运动、氛围、转场节奏…"
              className={cn(
                selectClass,
                "min-h-[200px] font-mono text-[12px] leading-relaxed",
              )}
            />

            <div className="mt-4 flex gap-3">
              <Button
                variant="outline"
                onClick={() => void autoPrompt()}
                disabled={autoPrompting}
                className="flex-1 rounded-full"
              >
                {autoPrompting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    AI 生成中…
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    AI 自动生成
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => setStep("storyboard")}
                className="flex-1 rounded-full"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                返回选帧
              </Button>
            </div>

            <Button
              onClick={() => void submitVideo()}
              size="lg"
              className="mt-4 w-full rounded-full bg-sky-500 hover:bg-sky-600"
            >
              生成宣传视频
            </Button>
          </div>
        </div>
      )}

      {/* Step 4 — 视频 */}
      {step === "video" && (
        <div className="mx-auto max-w-2xl space-y-6">
          {(vidStatus === "queue" || vidStatus === "proc") && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200/60 bg-white py-16 dark:border-white/10 dark:bg-white/5">
              <Loader2 className="mb-4 h-12 w-12 animate-spin text-sky-400" />
              <h3 className="mb-2 text-lg font-semibold text-slate-800 dark:text-slate-200">
                正在生成宣传视频
              </h3>
              <p className="mb-6 text-[13px] text-slate-500">预计 5–20 分钟，请耐心等待</p>
              <div className="h-2 w-full max-w-xs overflow-hidden rounded-full bg-slate-100 dark:bg-white/10">
                <div
                  className="h-full rounded-full bg-sky-500 transition-all duration-500"
                  style={{ width: `${Math.min(vidProgress, 99)}%` }}
                />
              </div>
              {vidProgress > 0 && (
                <p className="mt-3 text-[12px] text-slate-400">{vidProgress}%</p>
              )}
            </div>
          )}

          {vidStatus === "done" && vidUrl && (
            <div className="flex flex-col items-center rounded-2xl border border-slate-200/60 bg-white py-10 dark:border-white/10 dark:bg-white/5">
              <CheckCircle2 className="mb-4 h-12 w-12 text-emerald-400" />
              <h3 className="mb-4 text-lg font-semibold text-slate-800 dark:text-slate-200">
                视频生成完成
              </h3>
              <div className="mb-6 w-full max-w-md overflow-hidden rounded-2xl bg-black shadow-lg">
                <video controls className="w-full">
                  <source src={resolveMediaUrl(vidUrl)} />
                </video>
              </div>
              <div className="flex gap-3">
                <Button variant="outline" onClick={reset} className="rounded-full">
                  创建新视频
                </Button>
                <a
                  href={resolveMediaUrl(vidUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  download
                >
                  <Button className="rounded-full bg-sky-500 hover:bg-sky-600">
                    <Download className="mr-2 h-4 w-4" />
                    下载视频
                  </Button>
                </a>
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
              <p className="mb-6 max-w-sm text-center text-[13px] text-slate-500">{vidErr}</p>
              <Button onClick={reset} className="rounded-full bg-sky-500 hover:bg-sky-600">
                重新开始
              </Button>
            </div>
          )}
        </div>
      )}
    </VideoWorkflowPage>
  )
}
