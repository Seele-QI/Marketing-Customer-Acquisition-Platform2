"use client"

/**
 * 数字人视频创作（新）— 创作配置 → AI 分镜脚本 → 多段成片
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTheme } from "next-themes"
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Film,
  Loader2,
  Sparkles,
  XCircle,
  Zap,
  Ban,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { toast } from "@/hooks/use-toast"
import { resolveMediaUrl } from "@/lib/video/utils"
import { VideoCoverSettings } from "@/components/video-cover-settings"
import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import { startCoverGeneration } from "@/lib/video/cover-runtime"
import { PreviewVideoCoverPanel } from "@/components/video/preview-video-cover-panel"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { isLoginRequiredError } from "@/lib/auth/prompt-login"
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
  buildSegmentStripFromPlan,
  SegmentStrip,
  type SegmentStripItem,
} from "@/components/dh-video-v2/segment-strip"
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
import {
  PLAN_SCRIPT_SLOW_MS,
  ensureDhVideoV2PlanScriptReady,
  requestDhVideoV2ScriptPlan,
  retryDhVideoV2Segment,
  submitDhVideoV2,
} from "@/lib/dh-video-v2/api"
import { compressImagesForPlanScript } from "@/lib/dh-video-v2/plan-image-compress"
import {
  assessScriptDuration,
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
import type { AssetRef } from "@/lib/workflow-draft-store"
import {
  clearDraft,
  defaultDhVideoV2Draft,
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

function inferMode(images: number, _audios: number): DhVideoV2Mode {
  if (images === 0) return "text"
  // 数字人口播：参考图固定首帧；音频仅作 @音频1 口型参考
  return "first_frame"
}

export default function DhVideoV2Workflow({ initialScript = "" }: { initialScript?: string }) {
  const { resolvedTheme } = useTheme()
  const { requireLogin, promptLogin } = useLoginRequired()
  const runtimeApi = useTaskRuntimeApi()
  const dhRuntime = useRuntimeTask("dh-video-v2")
  const mockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const toastedRef = useRef("")
  const planStartedAtRef = useRef(0)
  const planAbortRef = useRef<AbortController | null>(null)
  const stepRef = useRef<Step>("compose")
  /** 用户主动离开生成页时，禁止 runtime 轮询再把 step 拉回 generating */
  const userLeftGeneratingRef = useRef(false)

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
  stepRef.current = step

  const [images, setImages] = useState<MaterialSlotItem[]>([])
  const [audios, setAudios] = useState<MaterialSlotItem[]>([])
  const [script, setScript] = useState("")
  const [creativeIdea, setCreativeIdea] = useState("")

  useEffect(() => {
    const s = initialScript.trim()
    if (s) setScript(s)
  }, [initialScript])
  const [scriptPlan, setScriptPlan] = useState<DhV2ScriptPlan | null>(null)

  const [aspectRatio, setAspectRatio] = useState<DhVideoV2Ratio>("9:16")
  const [coverAspectRatio, setCoverAspectRatio] = useState<CoverAspectRatio>(DEFAULT_COVER_ASPECT_RATIO)
  const [coverResolution, setCoverResolution] = useState<CoverResolution>(DEFAULT_COVER_RESOLUTION)

  const [planning, setPlanning] = useState(false)
  const [planErr, setPlanErr] = useState("")
  const [showAdvancedPlan, setShowAdvancedPlan] = useState(false)
  const [composePhase, setComposePhase] = useState("")
  const [taskId, setTaskId] = useState("")
  const [genStatus, setGenStatus] = useState<"idle" | "running" | "done" | "fail">("idle")
  const [genProgress, setGenProgress] = useState(0)
  const [genStage, setGenStage] = useState("")
  const [genErr, setGenErr] = useState("")
  const [videoUrl, setVideoUrl] = useState("")
  const [coverUrl, setCoverUrl] = useState("")
  const [coverStatus, setCoverStatus] = useState<"idle" | "running" | "success" | "failed">("idle")
  const [coverError, setCoverError] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [segCompleted, setSegCompleted] = useState(0)
  const [segTotal, setSegTotal] = useState(0)
  const [runtimeSegments, setRuntimeSegments] = useState<SegmentStripItem[]>([])
  const [retryingSegIndex, setRetryingSegIndex] = useState<number | null>(null)
  const [planSlow, setPlanSlow] = useState(false)
  const [planAttempt, setPlanAttempt] = useState(0)
  const [draftHydrating, setDraftHydrating] = useState(true)
  const [imageRefs, setImageRefs] = useState<AssetRef[]>([])
  const [audioRefs, setAudioRefs] = useState<AssetRef[]>([])

  useEffect(() => {
    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/9b53aa58-6ae0-40b5-94f4-2d3a818cb581", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa17e1" },
      body: JSON.stringify({
        sessionId: "aa17e1",
        location: "dh-video-v2-workflow.tsx:step-change",
        message: "step state changed",
        data: { step, genStatus, taskId: taskId || null },
        timestamp: Date.now(),
        hypothesisId: "H3",
      }),
    }).catch(() => {})
    // #endregion
  }, [step, genStatus, taskId])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const draft = loadDraft("dh-video-v2") ?? defaultDhVideoV2Draft()
      const hydratedImages: MaterialSlotItem[] = []
      for (const ref of draft.imageRefs) {
        const stored = await getWorkflowAsset(ref.id)
        if (!stored) continue
        const dataUrl = await blobToDataUrl(stored.blob)
        hydratedImages.push({
          id: ref.id,
          name: stored.name,
          previewUrl: dataUrl,
          dataUrl,
          sizeBytes: stored.size,
        })
      }
      const hydratedAudios: MaterialSlotItem[] = []
      for (const ref of draft.audioRefs) {
        const stored = await getWorkflowAsset(ref.id)
        if (!stored) continue
        const dataUrl = await blobToDataUrl(stored.blob)
        hydratedAudios.push({
          id: ref.id,
          name: stored.name,
          previewUrl: "",
          dataUrl,
          sizeBytes: stored.size,
          meta: ref.meta,
        })
      }
      if (cancelled) return
      setImageRefs(draft.imageRefs)
      setAudioRefs(draft.audioRefs)
      setStep(draft.step)
      setImages(hydratedImages)
      setAudios(hydratedAudios)
      setScript(draft.script)
      setCreativeIdea(draft.creativeIdea)
      setAspectRatio((draft.aspectRatio as DhVideoV2Ratio) || "9:16")
      setCoverAspectRatio(draft.coverAspectRatio ?? DEFAULT_COVER_ASPECT_RATIO)
      setCoverResolution(draft.coverResolution ?? DEFAULT_COVER_RESOLUTION)
      if (draft.scriptPlanJson) {
        try {
          setScriptPlan(JSON.parse(draft.scriptPlanJson) as DhV2ScriptPlan)
        } catch {
          setScriptPlan(null)
        }
      }
      setPlanErr(draft.planErr)
      setShowAdvancedPlan(draft.showAdvancedPlan)
      setTaskId(draft.taskId)
      setGenStatus(draft.genStatus)
      setGenProgress(draft.genProgress)
      setGenStage(draft.genStage)
      setGenErr(draft.genErr)
      setVideoUrl(draft.videoUrl)
      setDraftHydrating(false)
    })()
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    if (draftHydrating) return
    saveDraft("dh-video-v2", {
      step,
      script,
      creativeIdea,
      aspectRatio,
      coverAspectRatio,
      coverResolution,
      scriptPlanJson: scriptPlan ? JSON.stringify(scriptPlan) : "",
      planErr,
      showAdvancedPlan,
      taskId,
      genStatus,
      genProgress,
      genStage,
      genErr,
      videoUrl,
      imageRefs,
      audioRefs,
    })
  }, [
    draftHydrating,
    step,
    script,
    creativeIdea,
    aspectRatio,
    coverAspectRatio,
    coverResolution,
    scriptPlan,
    planErr,
    showAdvancedPlan,
    taskId,
    genStatus,
    genProgress,
    genStage,
    genErr,
    videoUrl,
    imageRefs,
    audioRefs,
  ])

  const durationPreview = useMemo(() => assessScriptDuration(script), [script])
  const mode = inferMode(images.length, audios.length)
  // 优先用已确认分镜段数；否则用口播评估段数。避免只按单段 450 显示、与「计划 N 段」不一致
  const billingSegmentCount =
    (scriptPlan?.segment_count && scriptPlan.segment_count > 0
      ? scriptPlan.segment_count
      : durationPreview.segment_count) || 0
  const estimatedCost =
    billingSegmentCount > 0
      ? estimateDhVideoV2Cost(
          "seedance",
          billingSegmentCount * 15,
          "720p",
          billingSegmentCount,
        )
      : 0

  const steps = buildSteps(step, genStatus)

  const segmentStripItems = useMemo(() => {
    if (!scriptPlan?.segments?.length) return runtimeSegments
    return buildSegmentStripFromPlan(scriptPlan.segments, runtimeSegments)
  }, [scriptPlan, runtimeSegments])

  useEffect(() => {
    if (!planning) {
      setPlanSlow(false)
      return
    }
    planStartedAtRef.current = Date.now()
    setPlanSlow(false)
    const timer = setInterval(() => {
      if (Date.now() - planStartedAtRef.current >= PLAN_SCRIPT_SLOW_MS) {
        setPlanSlow(true)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [planning, planAttempt])

  useEffect(() => {
    if (!dhRuntime) return

    let syncBranch = "none"
    if (dhRuntime.status === "running") syncBranch = "running"
    else if (dhRuntime.status === "success") syncBranch = "success"
    else if (dhRuntime.status === "failed") syncBranch = "failed"

    const segs = dhRuntime.result?.segments
    const segmentStatuses = Array.isArray(segs)
      ? segs.map((s) => String((s as Record<string, unknown>).status ?? ""))
      : []

    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/9b53aa58-6ae0-40b5-94f4-2d3a818cb581", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa17e1" },
      body: JSON.stringify({
        sessionId: "aa17e1",
        location: "dh-video-v2-workflow.tsx:dhRuntime-sync",
        message: "dhRuntime sync effect",
        data: {
          currentStep: stepRef.current,
          syncBranch,
          dhRuntimeStatus: dhRuntime.status,
          stageLabel: dhRuntime.stageLabel,
          segmentStatuses,
          willForceGenerating: syncBranch === "running" || syncBranch === "failed",
          userLeftGenerating: userLeftGeneratingRef.current,
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
      }),
    }).catch(() => {})
    // #endregion

    setTaskId(dhRuntime.taskId)
    setGenProgress(dhRuntime.progress)
    setGenStage(dhRuntime.stageLabel || "")
    if (typeof dhRuntime.result?.segmentCount === "number") {
      setSegTotal(dhRuntime.result.segmentCount)
    }
    if (typeof dhRuntime.result?.segmentsCompleted === "number") {
      setSegCompleted(dhRuntime.result.segmentsCompleted)
    }
    if (Array.isArray(segs)) {
      setRuntimeSegments(
        segs.map((s) => {
          const row = s as Record<string, unknown>
          return {
            index: Number(row.index ?? 0),
            status: String(row.status ?? "pending") as SegmentStripItem["status"],
            videoUrl: typeof row.videoUrl === "string" ? row.videoUrl : undefined,
            error: typeof row.error === "string" ? row.error : undefined,
            timeRange: typeof row.timeRange === "string" ? row.timeRange : undefined,
            dialogue: typeof row.dialogue === "string" ? row.dialogue : undefined,
          }
        }),
      )
    }

    // 封面与成片并行：成片已完成后 patch 封面仍会触发本 effect
    const nextCoverUrl = String(dhRuntime.result?.coverUrl ?? "")
    const metaCoverStatus = String(dhRuntime.meta?.coverStatus ?? "")
    if (nextCoverUrl) {
      setCoverUrl(nextCoverUrl)
      setCoverStatus("success")
      setCoverError("")
    } else if (metaCoverStatus === "running" || metaCoverStatus === "failed") {
      setCoverStatus(metaCoverStatus)
      if (metaCoverStatus === "failed") {
        setCoverError(String(dhRuntime.meta?.coverError ?? "封面生成失败"))
      }
    } else if (metaCoverStatus === "success" && !nextCoverUrl) {
      setCoverStatus("success")
    }

    if (dhRuntime.status === "running") {
      if (!userLeftGeneratingRef.current) {
        setStep("generating")
        setGenStatus("running")
        setGenErr("")
      }
      return
    }
    if (dhRuntime.status === "success") {
      const url = String(dhRuntime.result?.videoUrl ?? "")
      setGenStatus("done")
      setVideoUrl(url)
      userLeftGeneratingRef.current = false
      setStep("preview")
      if (toastedRef.current !== dhRuntime.taskId) {
        toastedRef.current = dhRuntime.taskId
        toast({ title: "数字人视频生成成功！" })
      }
      return
    }
    if (dhRuntime.status === "failed") {
      const hasPartial = Array.isArray(segs) && segs.some(
        (s) => (s as Record<string, unknown>).status === "completed",
      )
      if (hasPartial) {
        if (!userLeftGeneratingRef.current) {
          setStep("generating")
          setGenStatus("running")
        }
        setGenErr(dhRuntime.error || "部分段生成失败，可重试失败段")
        return
      }
      if (!userLeftGeneratingRef.current) {
        setStep("generating")
        setGenStatus("fail")
      }
      setGenErr(dhRuntime.error || "视频生成失败")
    }
  }, [dhRuntime])

  const addImage = useCallback(async (file: File) => {
    if (file.size > DH_V2_MAX_ASSET_BYTES) {
      toast({ title: "图片过大", description: "单张素材不超过 50MB", variant: "destructive" })
      return
    }
    const dataUrl = await fileToDataUrl(file)
    const id = newAssetId("dhv2_img")
    const put = await putWorkflowAsset({
      id,
      workflow: "dh-video-v2",
      name: file.name,
      mime: file.type || "image/png",
      kind: "image",
      blob: file,
    })
    if (!put.ok) {
      toast({ title: "素材保存失败", description: "本地存储空间可能不足", variant: "destructive" })
      return
    }
    const ref: AssetRef = {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: "image",
    }
    setImageRefs((prev) => [...prev, ref])
    setImages((prev) => {
      if (prev.length >= DH_V2_MAX_IMAGES) return prev
      return [
        ...prev,
        { id, name: file.name, previewUrl: dataUrl, dataUrl, sizeBytes: file.size },
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
    const id = newAssetId("dhv2_audio")
    const put = await putWorkflowAsset({
      id,
      workflow: "dh-video-v2",
      name: file.name,
      mime: file.type || "audio/mpeg",
      kind: "audio",
      meta: meta ? `时长 ${meta}` : undefined,
      blob: file,
    })
    if (!put.ok) {
      toast({ title: "素材保存失败", description: "本地存储空间可能不足", variant: "destructive" })
      return
    }
    const ref: AssetRef = {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: "audio",
      meta: meta ? `时长 ${meta}` : undefined,
    }
    setAudioRefs((prev) => [...prev, ref])
    setAudios((prev) => {
      if (prev.length >= DH_V2_MAX_AUDIOS) return prev
      return [
        ...prev,
        {
          id,
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

  const generateScriptPlan = async (opts?: { isRetry?: boolean }): Promise<DhV2ScriptPlan | null> => {
    const err = validateDhVideoV2Compose({ imageCount: images.length, script })
    if (err) {
      toast({ title: "还差一步", description: err, variant: "destructive" })
      return null
    }
    planAbortRef.current?.abort()
    const controller = new AbortController()
    planAbortRef.current = controller
    if (opts?.isRetry) {
      setPlanAttempt((n) => n + 1)
    }
    setPlanning(true)
    setPlanSlow(false)
    setPlanErr("")
    setComposePhase("正在准备分镜环境…")
    try {
      await ensureDhVideoV2PlanScriptReady({
        onStatus: (msg) => setComposePhase(msg),
      })
      if (controller.signal.aborted) return null

      setComposePhase("正在压缩参考图并生成分镜脚本，预计 2–3 分钟…")
      const imagesBase64 = await compressImagesForPlanScript(images.map((i) => i.dataUrl))
      if (controller.signal.aborted) return null

      const { plan } = await requestDhVideoV2ScriptPlan(
        {
          script: script.trim(),
          creative_idea: creativeIdea.trim() || "专业数字人口播，竖屏 9:16，自然表情",
          image_count: images.length,
          images_base64: imagesBase64,
          has_audio_ref: audios.length > 0,
        },
        { signal: controller.signal },
      )
      setScriptPlan(plan)
      setPlanSlow(false)
      setPlanErr("")
      return plan
    } catch (e) {
      if (controller.signal.aborted) return null
      const msg = e instanceof Error ? e.message : "分镜生成失败"
      setPlanErr(msg)
      if (isLoginRequiredError(msg)) {
        promptLogin(msg)
      } else {
        toast({
          title: "分镜生成失败",
          description: msg,
          variant: "destructive",
        })
      }
      return null
    } finally {
      setPlanning(false)
    }
  }

  const retryScriptPlan = async () => {
    if (!(await requireLogin("请先登录后再生成分镜脚本"))) return
    setStep("scriptPlan")
    setScriptPlan(null)
    setPlanErr("")
    await generateScriptPlan({ isRetry: true })
  }

  const runMockGeneration = () => {
    userLeftGeneratingRef.current = false
    const total = scriptPlan?.segment_count ?? 1
    const mockSegs: SegmentStripItem[] = (scriptPlan?.segments || []).map((s) => ({
      index: s.index,
      status: "pending" as const,
      timeRange: s.time_range,
      dialogue: s.dialogue,
    }))
    if (!mockSegs.length) {
      mockSegs.push({ index: 0, status: "pending", timeRange: "0-15s" })
    }
    setRuntimeSegments(mockSegs)
    setGenStatus("running")
    setGenProgress(0)
    setGenStage("模拟多段渲染…")
    setSegTotal(total)
    setSegCompleted(0)
    setStep("generating")
    let p = 0
    mockTimerRef.current = setInterval(() => {
      p += 10
      setGenProgress(Math.min(p, 95))
      setRuntimeSegments((prev) =>
        prev.map((s, i) => {
          if (i === 0 && p >= 30) return { ...s, status: "completed" }
          if (i === 1 && p >= 60 && total > 1) return { ...s, status: "completed" }
          if (i === 0 && p >= 10 && p < 30) return { ...s, status: "processing" }
          if (i === 1 && p >= 40 && p < 60 && total > 1) return { ...s, status: "processing" }
          return s
        }),
      )
      if (p >= 30) setSegCompleted(Math.min(1, total))
      if (p >= 60 && total > 1) setSegCompleted(2)
      setGenStage(p < 50 ? "段 1/N Seedance 渲染" : "拼接各段视频")
      if (p >= 100) {
        if (mockTimerRef.current) clearInterval(mockTimerRef.current)
        setGenProgress(100)
        setGenStatus("done")
        setSegCompleted(total)
        setRuntimeSegments((prev) =>
          prev.map((s) => ({ ...s, status: "completed" as const })),
        )
        setStep("preview")
        toast({ title: "Mock 演示完成" })
      }
    }, 400)
  }

  const handleRetrySegment = async (index: number) => {
    if (!taskId || DH_V2_MOCK_ENABLED) {
      setRuntimeSegments((prev) =>
        prev.map((s) =>
          s.index === index ? { ...s, status: "processing", error: undefined } : s,
        ),
      )
      setTimeout(() => {
        setRuntimeSegments((prev) =>
          prev.map((s) =>
            s.index === index ? { ...s, status: "completed" as const } : s,
          ),
        )
      }, 1200)
      return
    }
    setRetryingSegIndex(index)
    setGenErr("")
    userLeftGeneratingRef.current = false
    try {
      await retryDhVideoV2Segment(taskId, index)
      setGenStatus("running")
      setGenStage(`重试段 #${index + 1}…`)
      toast({ title: "已重新提交该段", description: "请稍候" })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "重试失败"
      toast({ title: "重试失败", description: msg, variant: "destructive" })
    } finally {
      setRetryingSegIndex(null)
    }
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
    setRuntimeSegments(
      plan.segments.map((s) => ({
        index: s.index,
        status: "pending" as const,
        timeRange: s.time_range,
        dialogue: s.dialogue,
      })),
    )
    try {
      if (DH_V2_MOCK_ENABLED) {
        setTaskId(`mock_${uid()}`)
        runMockGeneration()
        return
      }

      const res = await submitDhVideoV2(payload)
      userLeftGeneratingRef.current = false
      setTaskId(res.task_id)
      setGenStatus("running")
      setGenProgress(5)
      setGenStage("已提交，正在生成…")
      setStep("generating")
      setCoverUrl("")
      setCoverError("")
      setCoverStatus(images[0]?.dataUrl ? "running" : "idle")
      runtimeApi.register({
        kind: "dh-video-v2",
        taskId: res.task_id,
        progress: 5,
        stageLabel: "视频生成中",
        meta: { script: script.trim().slice(0, 80), segmentCount: plan.segment_count },
      })
      if (images[0]?.dataUrl) {
        startCoverGeneration({
          kind: "dh-video-v2",
          script: script.trim(),
          referenceImage: { dataUrl: images[0].dataUrl },
          aspectRatio: coverAspectRatio,
          resolution: coverResolution,
          linkedTaskId: res.task_id,
        })
      }
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
    const composeErr = validateDhVideoV2Compose({ imageCount: images.length, script })
    if (composeErr) {
      toast({ title: "还差一步", description: composeErr, variant: "destructive" })
      return
    }
    if (!(await requireLogin("请先登录后再生成视频"))) return
    setPlanErr("")
    setScriptPlan(null)
    setStep("scriptPlan")
    setComposePhase("正在生成分镜脚本，预计 2–3 分钟…")
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
      toast({ title: "分镜脚本已就绪", description: "确认后点击开始生成" })
      return
    }
    setComposePhase("视频创作时间约 3–15 分钟，请耐心等待…")
    await submitVideoWithPlan(plan)
    setPlanning(false)
    setComposePhase("")
  }

  const submitVideo = async () => {
    if (!scriptPlan) return
    await submitVideoWithPlan(scriptPlan)
  }

  const goBackFromGenerating = (options?: { abandonRuntime?: boolean }) => {
    if (mockTimerRef.current) clearInterval(mockTimerRef.current)
    userLeftGeneratingRef.current = true
    const shouldAbandon = options?.abandonRuntime === true || genStatus === "fail"
    const targetStep = scriptPlan ? "scriptPlan" : "compose"
    const hasRuntime = !!runtimeApi.getTask("dh-video-v2")

    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/9b53aa58-6ae0-40b5-94f4-2d3a818cb581", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa17e1" },
      body: JSON.stringify({
        sessionId: "aa17e1",
        location: "dh-video-v2-workflow.tsx:goBackFromGenerating",
        message: "user clicked back from generating",
        data: {
          currentStep: stepRef.current,
          targetStep,
          shouldAbandon,
          genStatus,
          dhRuntimeStatus: dhRuntime?.status ?? null,
          hasRuntime,
          abandonRuntimeOption: options?.abandonRuntime ?? false,
        },
        timestamp: Date.now(),
        hypothesisId: "H5",
      }),
    }).catch(() => {})
    // #endregion

    if (shouldAbandon && hasRuntime) {
      runtimeApi.abandon("dh-video-v2")
      setTaskId("")
      setSegCompleted(0)
      setSegTotal(0)
      setRuntimeSegments([])
    } else if (dhRuntime?.status === "running") {
      // UI 回退但后端仍在跑：保留 runtime 跟踪，仅隐藏生成页
      setGenStatus("idle")
      setGenProgress(dhRuntime.progress)
      setGenStage(dhRuntime.stageLabel || "")
    } else if (hasRuntime) {
      runtimeApi.abandon("dh-video-v2")
      setTaskId("")
      setSegCompleted(0)
      setSegTotal(0)
      setRuntimeSegments([])
    } else {
      setTaskId("")
      setSegCompleted(0)
      setSegTotal(0)
      setRuntimeSegments([])
    }
    setGenErr("")
    setRetryingSegIndex(null)
    setStep(targetStep)
    if (shouldAbandon) {
      setGenStatus("idle")
      setGenProgress(0)
      setGenStage("")
    }
  }

  const abandonTaskAndReturnToCompose = () => {
    if (mockTimerRef.current) clearInterval(mockTimerRef.current)
    userLeftGeneratingRef.current = true

    // #region agent log
    fetch("http://127.0.0.1:7359/ingest/9b53aa58-6ae0-40b5-94f4-2d3a818cb581", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "aa17e1" },
      body: JSON.stringify({
        sessionId: "aa17e1",
        location: "dh-video-v2-workflow.tsx:abandonTaskAndReturnToCompose",
        message: "user abandoned task",
        data: {
          currentStep: stepRef.current,
          taskId: taskId || null,
          hadRuntime: !!runtimeApi.getTask("dh-video-v2"),
        },
        timestamp: Date.now(),
        hypothesisId: "H1",
        runId: "post-fix",
      }),
    }).catch(() => {})
    // #endregion

    if (runtimeApi.getTask("dh-video-v2")) {
      runtimeApi.abandon("dh-video-v2")
    }
    setTaskId("")
    setGenStatus("idle")
    setGenProgress(0)
    setGenStage("")
    setGenErr("")
    setVideoUrl("")
    setCoverUrl("")
    setCoverStatus("idle")
    setCoverError("")
    setSegCompleted(0)
    setSegTotal(0)
    setRuntimeSegments([])
    setRetryingSegIndex(null)
    setStep("compose")
    toast({ title: "已放弃当前任务", description: "已返回填写素材，可重新配置后生成" })
  }

  const reset = () => {
    if (mockTimerRef.current) clearInterval(mockTimerRef.current)
    void clearWorkflowAssets("dh-video-v2")
    clearDraft("dh-video-v2")
    setImageRefs([])
    setAudioRefs([])
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
    setCoverUrl("")
    setCoverStatus("idle")
    setCoverError("")
    setSegCompleted(0)
    setSegTotal(0)
    setRuntimeSegments([])
    setRetryingSegIndex(null)
    setPlanSlow(false)
    setPlanErr("")
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

                <VideoCoverSettings
                  accent="rose"
                  aspectRatio={coverAspectRatio}
                  resolution={coverResolution}
                  onAspectRatioChange={setCoverAspectRatio}
                  onResolutionChange={setCoverResolution}
                />

                {durationPreview.char_count > 0 && (
                  <div className={cn("rounded-2xl border p-3 text-[11px]", tokens.cardBorder, tokens.card)}>
                    <p className={tokens.fieldLabel}>时长评估（3.3–3.6 字/秒，50–54 字/段）</p>
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

                {planSlow && planning && (
                  <div className={cn("rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-[11px]", tokens.cardBorder)}>
                    <p className="text-amber-200/90">分镜生成已超过 2 分钟，可点击重试</p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={cn("mt-2 h-8 w-full", tokens.btnOutline)}
                      onClick={() => void retryScriptPlan()}
                    >
                      重试分镜
                    </Button>
                  </div>
                )}

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

        {step === "scriptPlan" && !scriptPlan && (
          <div className="animate-in fade-in duration-300 space-y-4">
            <div
              className={cn(
                "flex min-h-[320px] flex-col items-center justify-center rounded-2xl border p-8 text-center",
                tokens.cardBorder,
                tokens.card,
              )}
            >
              {planning ? (
                <Loader2 className={cn("mb-4 h-10 w-10 animate-spin", tokens.slotIcon)} />
              ) : planErr ? (
                <AlertCircle className="mb-4 h-10 w-10 text-red-400" />
              ) : null}
              <p className={cn("text-[15px] font-semibold", tokens.title)}>
                {planErr ? "分镜生成失败" : "正在生成分镜脚本"}
              </p>
              <p className={cn("mt-2 text-[12px]", tokens.muted)}>
                {planErr
                  ? "请根据下方提示处理后重试"
                  : "大模型正在读图并拆分台词，预计 2–3 分钟，请耐心等待"}
              </p>
              {planSlow && (
                <p className="mt-3 text-[11px] text-amber-200/90">
                  已超过 2 分钟，可点击下方重试
                </p>
              )}
              {planErr ? (
                <div className="mt-4 w-full max-w-md rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                  <p className="text-[12px] text-red-200">{planErr}</p>
                  {/请先登录|NOT_LOGGED_IN/i.test(planErr) ? (
                    <p className="mt-1 text-[11px] text-red-200/80">
                      请先在右上角登录账号后再生成
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-6 flex w-full max-w-md gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    planAbortRef.current?.abort()
                    setPlanning(false)
                    setComposePhase("")
                    setStep("compose")
                  }}
                  className={cn("flex-1", tokens.btnOutline)}
                >
                  返回配置
                </Button>
                {planErr ? (
                  <Button
                    onClick={() => void retryScriptPlan()}
                    className={cn("flex-1", tokens.btnPrimary)}
                  >
                    重试分镜
                  </Button>
                ) : planSlow ? (
                  <Button
                    onClick={() => void retryScriptPlan()}
                    variant="outline"
                    className={cn("flex-1", tokens.btnOutline)}
                  >
                    重试分镜
                  </Button>
                ) : null}
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
              planSlow={planSlow && planning}
              onRetryPlan={() => void retryScriptPlan()}
              onRegenerate={async () => {
                await retryScriptPlan()
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
              "flex min-h-[320px] flex-col rounded-2xl border p-6 sm:p-8",
              tokens.cardBorder,
              tokens.card,
            )}
          >
            <div className="mb-4 flex flex-col items-center text-center">
              <div className="relative mb-4 h-16 w-16">
                <div className={cn("absolute inset-0 animate-spin rounded-full border-2", tokens.spinner)} />
                <div className="absolute inset-2 flex items-center justify-center rounded-full bg-black/10 dark:bg-white/5">
                  <Film className={cn("h-7 w-7", tokens.slotIcon)} />
                </div>
              </div>
              <p className={cn("text-[15px] font-semibold", tokens.title)}>正在生成数字人视频</p>
              <p className={cn("mt-1 text-[12px]", tokens.muted)}>{genStage || "处理中…"}</p>
              {genStatus === "running" && (
                <p className={cn("mt-1 text-[11px] text-amber-200/80")}>
                  视频创作时间约 3–15 分钟，请耐心等待
                </p>
              )}
              {segTotal > 0 && (
                <p className={cn("mt-1 text-[11px]", tokens.muted)}>
                  段进度 {segCompleted}/{segTotal}
                </p>
              )}
            </div>

            {segmentStripItems.length > 0 && (
              <div className="mb-4">
                <SegmentStrip
                  segments={segmentStripItems}
                  tokens={tokens}
                  onRetry={(idx) => void handleRetrySegment(idx)}
                  retryingIndex={retryingSegIndex}
                />
              </div>
            )}

            {taskId ? (
              <p className={cn("text-center font-mono text-[10px]", tokens.muted)}>task: {taskId}</p>
            ) : null}
            <div className={cn("mx-auto mt-4 h-1.5 w-full max-w-md overflow-hidden rounded-full", tokens.progressTrack)}>
              <div
                className={cn(
                  "h-full rounded-full bg-gradient-to-r transition-all duration-500",
                  tokens.progressFill,
                )}
                style={{ width: `${genProgress}%` }}
              />
            </div>
            {genErr && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-left">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
                <p className="text-[12px] text-red-200">{genErr}</p>
              </div>
            )}
            <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                onClick={() => goBackFromGenerating()}
                className={cn("min-w-[140px]", tokens.btnOutline)}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                返回上一步
              </Button>
              <Button
                variant="outline"
                onClick={abandonTaskAndReturnToCompose}
                className={cn(
                  "min-w-[140px] border-red-500/40 text-red-300 hover:bg-red-500/10 hover:text-red-200",
                  tokens.btnOutline,
                )}
              >
                <Ban className="mr-1.5 h-4 w-4" />
                放弃任务
              </Button>
              {genStatus === "fail" && (
                <Button
                  variant="outline"
                  onClick={() => {
                    goBackFromGenerating({ abandonRuntime: true })
                    setScriptPlan(null)
                    setStep("compose")
                  }}
                  className={cn("min-w-[140px]", tokens.btnOutline)}
                >
                  返回修改素材
                </Button>
              )}
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="animate-in fade-in duration-300">
            <div className={cn("rounded-2xl border p-5", tokens.cardBorder, tokens.card)}>
              <div className="mb-4 flex items-center gap-2 text-emerald-500">
                <CheckCircle2 className="h-5 w-5" />
                <span className={cn("text-[14px] font-semibold", tokens.title)}>生成完成</span>
              </div>
              {segmentStripItems.length > 0 && (
                <div className="mb-4">
                  <p className={cn("mb-2 text-[11px] font-medium", tokens.muted)}>各段预览</p>
                  <SegmentStrip segments={segmentStripItems} tokens={tokens} readOnly />
                </div>
              )}
              <PreviewVideoCoverPanel
                videoUrl={videoUrl}
                coverUrl={coverUrl}
                coverStatus={coverStatus}
                coverError={coverError}
                videoEmptyHint={
                  DH_V2_MOCK_ENABLED ? "Mock 模式无真实视频 URL" : "等待 video_url"
                }
                borderClassName={tokens.cardBorder}
                mutedClassName={tokens.muted}
                spinnerClassName={tokens.slotIcon}
                showDefaultDownloads={false}
                actions={
                  <div className="mt-5 flex flex-wrap gap-2">
                    {videoUrl ? (
                      <Button asChild className={tokens.btnPrimary}>
                        <a href={resolveMediaUrl(videoUrl)} download target="_blank" rel="noreferrer">
                          <Download className="mr-1.5 h-4 w-4" />
                          下载视频
                        </a>
                      </Button>
                    ) : null}
                    {coverUrl ? (
                      <Button asChild variant="outline" className={tokens.btnOutline}>
                        <a href={resolveMediaUrl(coverUrl)} download target="_blank" rel="noreferrer">
                          <Download className="mr-1.5 h-4 w-4" />
                          下载封面
                        </a>
                      </Button>
                    ) : null}
                    <Button variant="outline" onClick={reset} className={tokens.btnOutline}>
                      创建新视频
                    </Button>
                  </div>
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
