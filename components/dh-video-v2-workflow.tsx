"use client"

/**
 * 数字人视频创作（新）— 创作配置 → AI 分镜脚本 → 多段成片
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { resolveMediaUrl } from "@/lib/video/utils"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import {
  WorkflowStepIndicator,
  type WorkflowStepId,
  type WorkflowStepStatus,
} from "@/components/video-workflow-shell"
import {
  MaterialSlotGrid,
  type MaterialSlotItem,
} from "@/components/dh-video-v2/material-slot-grid"
import { DhV2ThemePanel } from "@/components/dh-video-v2/dh-v2-theme-panel"
import { ScriptPlanPanel } from "@/components/dh-video-v2/script-plan-panel"
import {
  DH_V2_ACCEPTED_AUDIOS,
  DH_V2_ACCEPTED_IMAGES,
  DH_V2_MAX_ASSET_BYTES,
  DH_V2_MAX_AUDIOS,
  DH_V2_MAX_IMAGES,
  DH_V2_MOCK_ENABLED,
  DH_V2_SEEDANCE_RATIOS,
  DH_V2_STEP_LABELS,
  buildSubmitPayload,
  estimateDhVideoV2Cost,
  validateDhVideoV2Compose,
  validateDhVideoV2ScriptPlan,
} from "@/lib/dh-video-v2/constants"
import { requestDhVideoV2ScriptPlan, submitDhVideoV2 } from "@/lib/dh-video-v2/api"
import {
  assessScriptDuration,
  buildLocalScriptPlan,
  buildScriptPlanSkeleton,
  type DhV2ScriptPlan,
} from "@/lib/dh-video-v2/script-plan"
import {
  getDhV2InputClass,
  getDhV2ThemeTokens,
  getWorkflowAccent,
  loadDhV2UiPrefs,
  saveDhV2UiPrefs,
  type DhV2UiPrefs,
} from "@/lib/dh-video-v2/theme"
import type {
  DhVideoV2Mode,
  DhVideoV2Ratio,
} from "@/lib/dh-video-v2/types"

type Step = "compose" | "scriptPlan" | "generating" | "preview"

const STEP_KEYS: Step[] = ["compose", "generating", "preview"]

function stepIndex(step: Step): number {
  if (step === "scriptPlan") return 0
  return STEP_KEYS.indexOf(step)
}

function buildSteps(
  step: Step,
  genStatus: "idle" | "running" | "done" | "fail",
): { id: WorkflowStepId; label: string; status: WorkflowStepStatus }[] {
  const uiStep: Step =
    step === "scriptPlan" ? "compose" : step
  const current = stepIndex(uiStep) + 1
  return DH_V2_STEP_LABELS.map(({ id, label }) => {
    if (id < current) return { id, label, status: "done" as const }
    if (id > current) return { id, label, status: "pending" as const }
    if (uiStep === "generating") {
      if (genStatus === "fail") return { id, label, status: "error" as const }
      if (genStatus === "running") return { id, label, status: "loading" as const }
      if (genStatus === "done") return { id, label, status: "done" as const }
      return { id, label, status: "active" as const }
    }
    if (uiStep === "preview" && genStatus === "done") {
      return { id, label, status: "done" as const }
    }
    return { id, label, status: "active" as const }
  })
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error("读取失败"))
    reader.readAsDataURL(file)
  })
}

function probeAudioDuration(file: File): Promise<string> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio(url)
    audio.addEventListener("loadedmetadata", () => {
      const sec = Math.round(audio.duration)
      URL.revokeObjectURL(url)
      resolve(`${sec}s`)
    })
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url)
      resolve("")
    })
  })
}

function inferMode(images: number, audios: number): DhVideoV2Mode {
  if (images === 0) return "text"
  if (audios > 0) return "multimodal"
  return "first_frame"
}

export default function DhVideoV2Workflow() {
  const { resolvedTheme } = useTheme()
  const runtimeApi = useTaskRuntimeApi()
  const dhRuntime = useRuntimeTask("dh-video-v2")
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastedRef = useRef("")

  const [uiPrefs, setUiPrefs] = useState<DhV2UiPrefs>(() =>
    loadDhV2UiPrefs(resolvedTheme === "light" ? "light" : "dark"),
  )

  useEffect(() => {
    if (resolvedTheme && !localStorage.getItem("dh-v2-ui-prefs")) {
      setUiPrefs(loadDhV2UiPrefs(resolvedTheme === "light" ? "light" : "dark"))
    }
  }, [resolvedTheme])

  const tokens = useMemo(
    () => getDhV2ThemeTokens(uiPrefs.surface, uiPrefs.accent),
    [uiPrefs],
  )
  const inputClass = useMemo(
    () => getDhV2InputClass(uiPrefs.surface, uiPrefs.accent),
    [uiPrefs],
  )
  const workflowAccent = getWorkflowAccent(uiPrefs.accent)

  const handlePrefsChange = (prefs: DhV2UiPrefs) => {
    setUiPrefs(prefs)
    saveDhV2UiPrefs(prefs)
  }

  const [step, setStep] = useState<Step>("compose")
  const [images, setImages] = useState<MaterialSlotItem[]>([])
  const [audios, setAudios] = useState<MaterialSlotItem[]>([])
  const [script, setScript] = useState("")
  const [creativeIdea, setCreativeIdea] = useState("")
  const [scriptPlan, setScriptPlan] = useState<DhV2ScriptPlan | null>(null)

  const [aspectRatio, setAspectRatio] = useState<DhVideoV2Ratio>("9:16")

  const [planning, setPlanning] = useState(false)
  const [showAdvancedPlan, setShowAdvancedPlan] = useState(false)
  const [composePhase, setComposePhase] = useState("")
  const [taskId, setTaskId] = useState("")
  const [genStatus, setGenStatus] = useState<"idle" | "running" | "done" | "fail">("idle")
  const [genProgress, setGenProgress] = useState(0)
  const [genStage, setGenStage] = useState("")
  const [genErr, setGenErr] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [segCompleted, setSegCompleted] = useState(0)
  const [segTotal, setSegTotal] = useState(0)

  const durationPreview = useMemo(() => assessScriptDuration(script), [script])
  const mode = inferMode(images.length, audios.length)
  const estimatedCost = estimateDhVideoV2Cost(
    "seedance",
    scriptPlan?.plan_duration ?? durationPreview.plan_duration,
    "720p",
  )

  const steps = buildSteps(step, genStatus)

  useEffect(() => {
    if (!dhRuntime) return
    setTaskId(dhRuntime.taskId)
    setGenProgress(dhRuntime.progress)
    setGenStage(dhRuntime.stageLabel || "")
    if (typeof dhRuntime.result?.segmentCount === "number") {
      setSegTotal(dhRuntime.result.segmentCount)
    }
    if (typeof dhRuntime.result?.segmentsCompleted === "number") {
      setSegCompleted(dhRuntime.result.segmentsCompleted)
    }

    if (dhRuntime.status === "running") {
      setStep("generating")
      setGenStatus("running")
      setGenErr("")
      return
    }
    if (dhRuntime.status === "success") {
      const url = String(dhRuntime.result?.videoUrl ?? "")
      setGenStatus("done")
      setVideoUrl(url)
      setStep("preview")
      if (toastedRef.current !== dhRuntime.taskId) {
        toastedRef.current = dhRuntime.taskId
        toast({ title: "数字人视频生成成功！" })
      }
      return
    }
    if (dhRuntime.status === "failed") {
      setStep("generating")
      setGenStatus("fail")
      setGenErr(dhRuntime.error || "视频生成失败")
    }
  }, [dhRuntime])

  const addImage = useCallback(async (file: File) => {
    if (file.size > DH_V2_MAX_ASSET_BYTES) {
      toast({ title: "图片过大", description: "单张素材不超过 50MB", variant: "destructive" })
      return
    }
    const dataUrl = await fileToDataUrl(file)
    setImages((prev) => {
      if (prev.length >= DH_V2_MAX_IMAGES) return prev
      return [
        ...prev,
        { id: uid(), name: file.name, previewUrl: dataUrl, dataUrl, sizeBytes: file.size },
      ]
    })
  }, [])

  const addAudio = useCallback(async (file: File) => {
    if (file.size > DH_V2_MAX_ASSET_BYTES) {
      toast({ title: "音频过大", description: "单个素材不超过 50MB", variant: "destructive" })
      return
    }
    const dataUrl = await fileToDataUrl(file)
    const meta = await probeAudioDuration(file)
    const secMatch = meta.match(/(\d+)/)
    const sec = secMatch ? Number(secMatch[1]) : 0
    if (sec > 0 && (sec < 2 || sec > 15)) {
      toast({
        title: "音频时长不符合要求",
        description: "参考音频需在 2–15 秒之间（Seedance 限制），请裁剪后重试",
        variant: "destructive",
      })
      return
    }
    setAudios((prev) => {
      if (prev.length >= DH_V2_MAX_AUDIOS) return prev
      return [
        ...prev,
        {
          id: uid(),
          name: file.name,
          previewUrl: "",
          dataUrl,
          sizeBytes: file.size,
          meta: meta ? `时长 ${meta}` : undefined,
        },
      ]
    })
  }, [])

  const reorderImages = (from: number, to: number) => {
    setImages((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
      return next
    })
  }

  const generateScriptPlan = async (): Promise<DhV2ScriptPlan | null> => {
    const err = validateDhVideoV2Compose({ imageCount: images.length, script })
    if (err) {
      toast({ title: "还差一步", description: err, variant: "destructive" })
      return null
    }
    const skeleton = buildScriptPlanSkeleton(script)
    setComposePhase("正在编写分镜脚本…")
    try {
      const { plan } = await requestDhVideoV2ScriptPlan({
        script: script.trim(),
        creative_idea: creativeIdea.trim() || "专业数字人口播，竖屏 9:16，自然表情",
        image_count: images.length,
        has_audio_ref: audios.length > 0,
        dialogue_slices: skeleton.segments.map((s) => s.dialogue),
        plan_duration: skeleton.plan_duration,
        segment_count: skeleton.segment_count,
      })
      setScriptPlan(plan)
      return plan
    } catch (e) {
      const local = buildLocalScriptPlan(
        script.trim(),
        creativeIdea.trim() || "专业数字人口播，竖屏 9:16，自然表情",
        audios.length > 0,
      )
      setScriptPlan(local)
      toast({
        title: "已用本地模板生成分镜",
        description:
          e instanceof Error
            ? `${e.message.slice(0, 80)}… 仍可继续生成`
            : "AI 暂不可用，仍可继续生成",
      })
      return local
    }
  }

  const runMockGeneration = () => {
    setGenStatus("running")
    setGenProgress(0)
    setGenStage("模拟多段渲染…")
    setSegTotal(scriptPlan?.segment_count ?? 1)
    setSegCompleted(0)
    setStep("generating")
    let p = 0
    mockTimerRef.current = setInterval(() => {
      p += 10
      setGenProgress(Math.min(p, 95))
      if (p >= 30) setSegCompleted(1)
      if (p >= 60 && (scriptPlan?.segment_count ?? 1) > 1) setSegCompleted(2)
      setGenStage(p < 50 ? "段 1/N Seedance 渲染" : "拼接各段视频")
      if (p >= 100) {
        if (mockTimerRef.current) clearInterval(mockTimerRef.current)
        setGenProgress(100)
        setGenStatus("done")
        setSegCompleted(scriptPlan?.segment_count ?? 1)
        setStep("preview")
        toast({ title: "Mock 演示完成" })
      }
    }, 400)
  }

  const submitVideoWithPlan = async (plan: DhV2ScriptPlan) => {
    const err = validateDhVideoV2ScriptPlan(plan)
    if (err) {
      toast({ title: "无法提交", description: err, variant: "destructive" })
      return
    }

    const payload = buildSubmitPayload({
      provider: "seedance",
      mode,
      imagesDataUrl: images.map((i) => i.dataUrl),
      audiosDataUrl: audios.map((a) => a.dataUrl),
      aspectRatio,
      xingheRatio: "9:16",
      resolution: "720p",
      xingheModel: "xinghe-2.0",
      segments: plan.segments,
      clientTaskId: `dhv2_${uid()}`,
    })

    setSubmitting(true)
    setGenErr("")
    setSegTotal(plan.segment_count)
    setSegCompleted(0)
    try {
      if (DH_V2_MOCK_ENABLED) {
        setTaskId(`mock_${uid()}`)
        runMockGeneration()
        return
      }

      const res = await submitDhVideoV2(payload)
      setTaskId(res.task_id)
      setGenStatus("running")
      setGenProgress(5)
      setGenStage("已提交，正在生成…")
      setStep("generating")
      runtimeApi.register({
        kind: "dh-video-v2",
        taskId: res.task_id,
        progress: 5,
        stageLabel: "视频生成中",
        meta: { script: script.trim().slice(0, 80), segmentCount: plan.segment_count },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败"
      setGenErr(msg)
      setStep("compose")
      toast({ title: "提交失败", description: msg, variant: "destructive" })
    } finally {
      setSubmitting(false)
      setComposePhase("")
    }
  }

  const createVideo = async () => {
    setPlanning(true)
    const plan = await generateScriptPlan()
    if (!plan) {
      setPlanning(false)
      setComposePhase("")
      return
    }
    if (showAdvancedPlan) {
      setPlanning(false)
      setComposePhase("")
      setStep("scriptPlan")
      toast({ title: "分镜脚本已就绪", description: "确认后点击开始生成" })
      return
    }
    setComposePhase(`正在生成 ${plan.segment_count} 段视频…`)
    await submitVideoWithPlan(plan)
    setPlanning(false)
  }

  const submitVideo = async () => {
    if (!scriptPlan) return
    await submitVideoWithPlan(scriptPlan)
  }

  const reset = () => {
    if (mockTimerRef.current) clearInterval(mockTimerRef.current)
    setStep("compose")
    setImages([])
    setAudios([])
    setScript("")
    setCreativeIdea("")
    setScriptPlan(null)
    setTaskId("")
    setGenStatus("idle")
    setGenProgress(0)
    setGenStage("")
    setGenErr("")
    setVideoUrl("")
    setSegCompleted(0)
    setSegTotal(0)
  }

  const fieldLabel = cn("mb-1 block text-[11px] font-medium", tokens.fieldLabel)

  return (
    <div className={cn("dh-v2-workflow relative h-full overflow-y-auto", tokens.page)}>
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{ background: tokens.pageGlow }}
      />
      <div
        className={cn("pointer-events-none absolute inset-0", tokens.grain)}
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 py-5 sm:px-6 sm:py-6">
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className={cn("mb-2 h-0.5 w-10 rounded-full", tokens.bar)} />
            <h1 className={cn("font-serif text-[22px] font-bold tracking-tight sm:text-[26px]", tokens.title)}>
              数字人
              <span className={cn("ml-1", tokens.titleAccent)}> 视频创作</span>
              <span className={cn("ml-2 text-[14px] font-normal", tokens.subtitle)}>（新）</span>
            </h1>
            <p className={cn("mt-1 max-w-2xl text-[12px] leading-relaxed", tokens.subtitle)}>
              上传形象与文案，一键生成 · 自动分镜 · 长文案自动分段拼接
            </p>
          </div>
          <DhV2ThemePanel prefs={uiPrefs} onChange={handlePrefsChange} />
        </header>

        <div className="mb-4">
          <WorkflowStepIndicator accentColor={workflowAccent} steps={steps} />
        </div>

        {step === "compose" && (
          <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="space-y-4 lg:col-span-2">
                <div className={cn("rounded-2xl border p-4", tokens.cardBorder, tokens.card)}>
                  <MaterialSlotGrid
                    kind="image"
                    labelPrefix="参考图"
                    maxSlots={DH_V2_MAX_IMAGES}
                    items={images}
                    onAdd={(f) => { void addImage(f) }}
                    onRemove={(id) => setImages((p) => p.filter((i) => i.id !== id))}
                    onReorder={reorderImages}
                    accept={DH_V2_ACCEPTED_IMAGES}
                    hint="JPG / PNG / WebP"
                    tokens={tokens}
                  />
                  <div className="mt-4">
                    <MaterialSlotGrid
                      kind="audio"
                      labelPrefix="参考音频"
                      maxSlots={DH_V2_MAX_AUDIOS}
                      items={audios}
                      onAdd={(f) => { void addAudio(f) }}
                      onRemove={(id) => setAudios((p) => p.filter((i) => i.id !== id))}
                      accept={DH_V2_ACCEPTED_AUDIOS}
                      hint="MP3 / WAV · 可选 · 2–15 秒"
                      tokens={tokens}
                    />
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <label className={fieldLabel}>
                        口播文案 <span className="text-red-400">*</span>
                        <span className={cn("ml-2 font-normal", tokens.muted)}>{script.length} 字</span>
                      </label>
                      <textarea
                        value={script}
                        onChange={(e) => setScript(e.target.value)}
                        placeholder="粘贴你要说的话就行，系统会自动算时长、拆段、写分镜…"
                        className={cn(inputClass, "min-h-[100px] resize-none leading-relaxed")}
                      />
                    </div>
                    <div>
                      <label className={fieldLabel}>画面风格（可选）</label>
                      <textarea
                        value={creativeIdea}
                        onChange={(e) => setCreativeIdea(e.target.value)}
                        placeholder="不填也行，默认专业演播室口播风"
                        className={cn(inputClass, "min-h-[72px] resize-none leading-relaxed")}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className={cn("rounded-2xl border p-4", tokens.cardBorder, tokens.card)}>
                  <p className={cn("mb-2 text-[11px] font-semibold", tokens.fieldLabel)}>画面比例</p>
                  <select
                    value={aspectRatio}
                    onChange={(e) => setAspectRatio(e.target.value as DhVideoV2Ratio)}
                    className={inputClass}
                  >
                    {DH_V2_SEEDANCE_RATIOS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <p className={cn("mt-2 text-[10px]", tokens.muted)}>Seedance 2.0 Fast · 每段 15 秒</p>
                </div>

                {durationPreview.char_count > 0 && (
                  <div className={cn("rounded-2xl border p-3 text-[11px]", tokens.cardBorder, tokens.card)}>
                    <p className={tokens.fieldLabel}>时长评估（2.8–3.3 字/秒）</p>
                    <p className={cn("mt-1", tokens.title)}>
                      约 {durationPreview.duration_min}–{durationPreview.duration_max} 秒
                    </p>
                    <p className={cn("mt-0.5", tokens.muted)}>
                      计划 {durationPreview.plan_duration}s · {durationPreview.segment_count} 段 × 15s
                    </p>
                  </div>
                )}

                <div className={cn("rounded-2xl border p-4", tokens.costCard)}>
                  <div className={cn("flex items-center gap-2", tokens.fieldLabel)}>
                    <Zap className="h-4 w-4" />
                    <span className="text-[11px] font-semibold">预估积分</span>
                  </div>
                  <p className="mt-1 text-[20px] font-bold">{estimatedCost.toLocaleString()}</p>
                </div>

                <label className={cn("flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2", tokens.cardBorder)}>
                  <input
                    type="checkbox"
                    checked={showAdvancedPlan}
                    onChange={(e) => setShowAdvancedPlan(e.target.checked)}
                    className="rounded"
                  />
                  <span className={cn("text-[11px]", tokens.muted)}>生成前先编辑分镜脚本（高级）</span>
                </label>

                <Button
                  onClick={() => void createVideo()}
                  disabled={planning || submitting}
                  className={cn("w-full", tokens.btnPrimary)}
                >
                  {planning || submitting ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <Film className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {composePhase || (planning ? "准备中…" : `生成视频 · ${estimatedCost.toLocaleString()} 积分`)}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "scriptPlan" && scriptPlan && (
          <div className="animate-in fade-in duration-300 space-y-4">
            <ScriptPlanPanel
              plan={scriptPlan}
              tokens={tokens}
              surface={uiPrefs.surface}
              accent={uiPrefs.accent}
              onChange={setScriptPlan}
              onRegenerate={async () => {
                setPlanning(true)
                await generateScriptPlan()
                setPlanning(false)
              }}
              regenerating={planning}
            />
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => setStep("compose")}
                className={cn("flex-1", tokens.btnOutline)}
              >
                <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                返回配置
              </Button>
              <Button
                onClick={() => void submitVideo()}
                disabled={submitting}
                className={cn("flex-[2]", tokens.btnPrimary)}
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <Film className="mr-1.5 h-3.5 w-3.5" />
                )}
                开始生成 · {estimatedCost.toLocaleString()} 积分
              </Button>
            </div>
          </div>
        )}

        {step === "generating" && (
          <div
            className={cn(
              "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border p-8",
              tokens.cardBorder,
              tokens.card,
            )}
          >
            <div className="relative mb-6 h-20 w-20">
              <div className={cn("absolute inset-0 animate-spin rounded-full border-2", tokens.spinner)} />
              <div className="absolute inset-2 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/5">
                <Film className={cn("h-8 w-8", tokens.slotIcon)} />
              </div>
            </div>
            <p className={cn("text-[15px] font-semibold", tokens.title)}>正在生成数字人视频</p>
            <p className={cn("mt-1 text-[12px]", tokens.muted)}>{genStage || "处理中…"}</p>
            {segTotal > 0 && genStatus === "running" && (
              <p className={cn("mt-1 text-[10px]", tokens.muted)}>
                预计等待约 {Math.max(3, segTotal * 8)}–{Math.max(5, segTotal * 15)} 分钟（每段约 8–15 分钟）
              </p>
            )}
            {segTotal > 0 && (
              <p className={cn("mt-1 text-[11px]", tokens.muted)}>
                段进度 {segCompleted}/{segTotal}
              </p>
            )}
            {taskId ? (
              <p className={cn("mt-2 font-mono text-[10px]", tokens.muted)}>task: {taskId}</p>
            ) : null}
            <div className={cn("mt-6 h-1.5 w-64 overflow-hidden rounded-full", tokens.progressTrack)}>
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                  tokens.progressFill,
                )}
                style={{ width: `${genProgress}%` }}
              />
            </div>
            {genErr && (
              <div className="mt-6 flex flex-col gap-3">
                <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                  <p className="text-[12px] text-red-200">{genErr}</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => {
                    setGenErr("")
                    setGenStatus("idle")
                    setStep("compose")
                  }}
                  className={tokens.btnOutline}
                >
                  返回修改后重试
                </Button>
              </div>
            )}
          </div>
        )}

        {step === "preview" && (
          <div className="animate-in fade-in duration-300">
            <div className={cn("rounded-2xl border p-5", tokens.cardBorder, tokens.card)}>
              <div className="mb-4 flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className={cn("text-[14px] font-semibold", tokens.title)}>生成完成</span>
              </div>
              {videoUrl ? (
                <video
                  src={resolveMediaUrl(videoUrl)}
                  controls
                  className={cn(
                    "mx-auto max-h-[480px] w-full max-w-md rounded-xl border",
                    tokens.cardBorder,
                  )}
                />
              ) : (
                <div
                  className={cn(
                    "mx-auto flex aspect-[9/16] max-h-[400px] w-full max-w-xs items-center justify-center rounded-xl border border-dashed",
                    tokens.cardBorder,
                  )}
                >
                  <p className={cn("px-4 text-center text-[12px]", tokens.muted)}>
                    {DH_V2_MOCK_ENABLED ? "Mock 模式无真实视频 URL" : "等待 video_url"}
                  </p>
                </div>
              )}
              <div className="mt-5 flex flex-wrap gap-2">
                {videoUrl ? (
                  <Button asChild className={tokens.btnPrimary}>
                    <a href={resolveMediaUrl(videoUrl)} download target="_blank" rel="noreferrer">
                      <Download className="mr-1.5 h-4 w-4" />
                      下载视频
                    </a>
                  </Button>
                ) : null}
                <Button variant="outline" onClick={reset} className={tokens.btnOutline}>
                  创建新视频
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
