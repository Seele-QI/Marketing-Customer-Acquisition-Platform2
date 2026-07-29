"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertCircle, CheckCircle2, Download, ImagePlus, Loader2, Mic2, RefreshCw, RotateCcw, Square } from "lucide-react"

import { useLoginRequired } from "@/components/auth/login-required-provider"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import { VideoCoverSettings } from "@/components/video-cover-settings"
import { toast } from "@/hooks/use-toast"
import { cancelEconomyVideo, retryEconomySegment, submitEconomyVideo } from "@/lib/dh-video-economy/api"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import { startCoverGeneration } from "@/lib/video/cover-runtime"
import type { CoverAspectRatio, CoverResolution } from "@/lib/video/cover-constants"
import { resolveMediaUrl } from "@/lib/video/utils"
import type { AssetRef } from "@/lib/workflow-draft-store"
import {
  defaultDhVideoEconomyDraft,
  loadDraft,
  saveDraft,
} from "@/lib/workflow-draft-store"
import {
  blobToBase64,
  blobToDataUrl,
  getWorkflowAsset,
  newAssetId,
  putWorkflowAsset,
} from "@/lib/workflow-asset-store"

const WORKFLOW = "dh-video-economy" as const

const MOTION_PRESETS = {
  natural: {
    label: "自然克制",
    prompt: "他在自然地说话，偶尔使用克制的手势强调观点，动作自然，视线稳定看向镜头。",
  },
  friendly: {
    label: "亲切讲解",
    prompt: "他以亲切友好的方式讲解内容，表情温和，配合适度的开放手势，动作连贯自然。",
  },
  professional: {
    label: "专业表达",
    prompt: "他以专业沉稳的状态表达观点，姿态端正，手势简洁准确，语气和动作富有可信度。",
  },
  relaxed: {
    label: "轻松分享",
    prompt: "他像与朋友聊天一样轻松分享，神态放松，偶尔自然点头并使用轻微手势。",
  },
} as const

type MotionPreset = keyof typeof MOTION_PRESETS | "custom"
type MediaState = { ref: AssetRef; blob: Blob; dataUrl?: string }
type SegmentView = { index: number; status: string; error?: string; retryCount?: number }

function audioDuration(file: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = "metadata"
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(audio.duration) ? audio.duration : 0)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("无法读取参考音频时长"))
    }
    audio.src = url
  })
}

function segmentTone(status: string): string {
  if (status === "completed") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300"
  if (status === "failed" || status === "timeout") return "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
  return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-300"
}

export default function DhVideoEconomyWorkflow({ initialScript = "" }: { initialScript?: string }) {
  const draft = useMemo(() => loadDraft(WORKFLOW) ?? defaultDhVideoEconomyDraft(), [])
  const [script, setScript] = useState(draft.script || initialScript)
  const [motionPreset, setMotionPreset] = useState<MotionPreset>(draft.motionPreset)
  const [customMotionPrompt, setCustomMotionPrompt] = useState(draft.customMotionPrompt)
  const [coverAspectRatio, setCoverAspectRatio] = useState<CoverAspectRatio>(draft.coverAspectRatio)
  const [coverResolution, setCoverResolution] = useState<CoverResolution>(draft.coverResolution)
  const [image, setImage] = useState<MediaState | null>(null)
  const [audio, setAudio] = useState<MediaState | null>(null)
  const [audioSeconds, setAudioSeconds] = useState(Number(draft.audioRef?.meta || 0))
  const [submitting, setSubmitting] = useState(false)
  const [retryingSegment, setRetryingSegment] = useState<number | null>(null)
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const runtimeTask = useRuntimeTask(WORKFLOW)
  const runtimeApi = useTaskRuntimeApi()
  const { requireLogin } = useLoginRequired()

  const motionPrompt = motionPreset === "custom" ? customMotionPrompt.trim() : MOTION_PRESETS[motionPreset].prompt
  const result = runtimeTask?.result ?? {}
  const segments = (Array.isArray(result.segments) ? result.segments : []) as SegmentView[]
  const videoUrl = typeof result.videoUrl === "string" ? result.videoUrl : ""
  const coverUrl = typeof result.coverUrl === "string" ? result.coverUrl : ""
  const coverStatus = String(runtimeTask?.meta?.coverStatus || "idle")
  const coverError = String(runtimeTask?.meta?.coverError || "")
  const running = runtimeTask?.status === "running"

  useEffect(() => {
    let active = true
    void (async () => {
      const imageRef = draft.imageRefs[0]
      if (imageRef) {
        const stored = await getWorkflowAsset(imageRef.id)
        if (stored && active) setImage({ ref: imageRef, blob: stored.blob, dataUrl: await blobToDataUrl(stored.blob) })
      }
      if (draft.audioRef) {
        const stored = await getWorkflowAsset(draft.audioRef.id)
        if (stored && active) setAudio({ ref: draft.audioRef, blob: stored.blob })
      }
    })()
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    saveDraft(WORKFLOW, {
      script,
      motionPreset,
      customMotionPrompt,
      coverAspectRatio,
      coverResolution,
      taskId: runtimeTask?.taskId || "",
      imageRefs: image ? [image.ref] : [],
      audioRef: audio?.ref ?? null,
    })
  }, [script, motionPreset, customMotionPrompt, coverAspectRatio, coverResolution, runtimeTask?.taskId, image, audio])

  async function chooseImage(file?: File) {
    if (!file) return
    if (!file.type.startsWith("image/")) return toast({ title: "请选择图片文件", variant: "destructive" })
    if (file.size > 30 * 1024 * 1024) return toast({ title: "形象图不能超过 30MB", variant: "destructive" })
    const ref: AssetRef = { id: newAssetId("dhe_image"), name: file.name, mime: file.type, size: file.size, kind: "image" }
    const stored = await putWorkflowAsset({ ...ref, workflow: WORKFLOW, blob: file })
    if (!stored.ok) return toast({ title: "形象图保存失败", description: "请检查浏览器存储空间", variant: "destructive" })
    setImage({ ref, blob: file, dataUrl: await blobToDataUrl(file) })
  }

  async function chooseAudio(file?: File) {
    if (!file) return
    if (!file.type.startsWith("audio/")) return toast({ title: "请选择音频文件", variant: "destructive" })
    try {
      const duration = await audioDuration(file)
      if (duration <= 0 || duration > 30) {
        return toast({ title: "参考音频须在 30 秒以内", description: `当前约 ${duration.toFixed(1)} 秒`, variant: "destructive" })
      }
      const ref: AssetRef = { id: newAssetId("dhe_audio"), name: file.name, mime: file.type, size: file.size, kind: "audio", meta: duration.toFixed(3) }
      const stored = await putWorkflowAsset({ ...ref, workflow: WORKFLOW, blob: file })
      if (!stored.ok) return toast({ title: "参考音频保存失败", description: "请检查浏览器存储空间", variant: "destructive" })
      setAudio({ ref, blob: file })
      setAudioSeconds(duration)
    } catch (error) {
      toast({ title: "音频读取失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    }
  }

  function startCover(taskId: string) {
    if (!image?.dataUrl) return
    startCoverGeneration({
      kind: WORKFLOW,
      script,
      referenceImage: { dataUrl: image.dataUrl },
      aspectRatio: coverAspectRatio,
      resolution: coverResolution,
      linkedTaskId: taskId,
    })
  }

  async function submit() {
    if (!image || !audio) return toast({ title: "请上传形象图和参考音频", variant: "destructive" })
    if (!script.trim() || script.trim().length > 5000) return toast({ title: "口播文案须为 1–5000 字", variant: "destructive" })
    if (!motionPrompt || motionPrompt.length > 500) return toast({ title: "动作提示词须为 1–500 字", variant: "destructive" })
    if (!(await requireLogin("请先登录后再生成经济版数字人视频"))) return
    setSubmitting(true)
    try {
      const response = await submitEconomyVideo({
        image_base64: await blobToBase64(image.blob),
        audio_base64: await blobToBase64(audio.blob),
        script: script.trim(),
        motion_prompt: motionPrompt,
      })
      runtimeApi.register({
        kind: WORKFLOW,
        taskId: response.task_id,
        progress: 0,
        stageLabel: "已进入后台队列",
        meta: { script: script.trim(), previewUrl: image.dataUrl, coverStatus: "running" },
      })
      startCover(response.task_id)
      toast({ title: "任务已提交", description: "音色克隆与封面生成已开始" })
    } catch (error) {
      toast({ title: "提交失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      setSubmitting(false)
    }
  }

  async function retrySegment(index: number) {
    if (!runtimeTask) return
    setRetryingSegment(index)
    try {
      await retryEconomySegment(runtimeTask.taskId, index)
      toast({ title: `第 ${index + 1} 段已重新提交`, description: "本次重试扣除 200 积分" })
    } catch (error) {
      toast({ title: "重试失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    } finally {
      setRetryingSegment(null)
    }
  }

  async function cancel() {
    if (!runtimeTask) return
    try {
      await cancelEconomyVideo(runtimeTask.taskId)
      runtimeApi.patchTask(WORKFLOW, { stageLabel: "任务已取消" })
    } catch (error) {
      toast({ title: "取消失败", description: error instanceof Error ? error.message : String(error), variant: "destructive" })
    }
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto bg-slate-50/60 px-4 py-6 dark:bg-slate-950/40 sm:px-6"
      data-tutorial-id="dh-economy-workflow"
    >
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="overflow-hidden rounded-3xl border border-emerald-500/15 bg-gradient-to-br from-white via-white to-emerald-50/70 p-6 shadow-sm dark:from-slate-900 dark:via-slate-900 dark:to-emerald-950/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="mb-2 inline-flex rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-300">RunningHub · 20 秒并发分段</div>
              <h1 className="text-2xl font-semibold tracking-tight">数字人视频创作（经济版）</h1>
              <p className="mt-2 max-w-2xl text-sm text-muted-foreground">音色克隆 10 积分，视频每 20 秒一段，每段 250 积分，末段不足 20 秒仍按一段计费。完整音频切段并发生成，最终按原序拼接并精确裁剪。</p>
            </div>
            {runtimeTask ? <div className="rounded-2xl border bg-background/80 px-4 py-3 text-right"><p className="text-xs text-muted-foreground">当前任务</p><p className="mt-1 font-mono text-xs">{runtimeTask.taskId}</p></div> : null}
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
          <section className="space-y-5 rounded-3xl border bg-background p-5 shadow-sm">
            <div>
              <h2 className="font-semibold">1. 上传创作素材</h2>
              <p className="mt-1 text-xs text-muted-foreground">1 张清晰形象图 + 30 秒以内、带参考情绪的音频</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={() => imageInput.current?.click()} className="flex min-h-40 flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed bg-muted/30 text-sm hover:border-emerald-500/50">
                {image?.dataUrl ? <img src={image.dataUrl} alt="数字人形象预览" className="h-40 w-full object-cover" /> : <><ImagePlus className="mb-2 h-7 w-7 text-emerald-500" /><span>上传数字人形象</span></>}
              </button>
              <button type="button" onClick={() => audioInput.current?.click()} className="flex min-h-40 flex-col items-center justify-center rounded-2xl border border-dashed bg-muted/30 p-4 text-sm hover:border-emerald-500/50">
                <Mic2 className="mb-2 h-7 w-7 text-emerald-500" />
                <span className="max-w-full truncate">{audio?.ref.name || "上传参考音色"}</span>
                {audio ? <span className="mt-1 text-xs text-muted-foreground">{audioSeconds.toFixed(1)} 秒</span> : <span className="mt-1 text-xs text-muted-foreground">实际时长不超过 30 秒</span>}
              </button>
              <input ref={imageInput} className="hidden" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void chooseImage(event.target.files?.[0])} />
              <input ref={audioInput} className="hidden" type="file" accept="audio/*" onChange={(event) => void chooseAudio(event.target.files?.[0])} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><label className="text-sm font-medium">口播文案</label><span className="text-xs text-muted-foreground">{script.length}/5000</span></div>
              <Textarea value={script} maxLength={5000} onChange={(event) => setScript(event.target.value)} rows={9} placeholder="输入需要数字人口播的完整文案……" className="min-h-52 resize-y" />
            </div>

            <div>
              <label className="text-sm font-medium">动作提示词</label>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {Object.entries(MOTION_PRESETS).map(([key, preset]) => <Button key={key} type="button" size="sm" variant={motionPreset === key ? "default" : "outline"} onClick={() => setMotionPreset(key as MotionPreset)}>{preset.label}</Button>)}
                <Button type="button" size="sm" variant={motionPreset === "custom" ? "default" : "outline"} onClick={() => setMotionPreset("custom")}>自定义</Button>
              </div>
              {motionPreset === "custom" ? <Textarea className="mt-3" maxLength={500} value={customMotionPrompt} onChange={(event) => setCustomMotionPrompt(event.target.value)} placeholder="描述人物的表情、手势与表达状态" /> : <p className="mt-3 rounded-xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{motionPrompt}</p>}
            </div>

            <VideoCoverSettings aspectRatio={coverAspectRatio} resolution={coverResolution} onAspectRatioChange={setCoverAspectRatio} onResolutionChange={setCoverResolution} accent="emerald" />
            <Button className="h-11 w-full bg-emerald-600 hover:bg-emerald-700" disabled={submitting || running} onClick={() => void submit()}>{submitting ? <Loader2 className="animate-spin" /> : null}{running ? "任务正在后台运行" : "提交经济版数字人任务"}</Button>
          </section>

          <section className="space-y-5 rounded-3xl border bg-background p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-semibold">2. 生成进度与结果</h2><p className="mt-1 text-xs text-muted-foreground">封面失败不会阻断视频生成与下载</p></div>{running ? <Button variant="outline" size="sm" onClick={() => void cancel()}><Square />取消</Button> : null}</div>
            {!runtimeTask ? <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed text-center text-muted-foreground"><Loader2 className="mb-3 h-8 w-8 opacity-30" /><p className="text-sm">提交后在这里查看音色克隆、切段、并发生成与拼接进度</p></div> : <>
              <div className="rounded-2xl border bg-muted/20 p-4"><div className="mb-2 flex items-center justify-between text-sm"><span>{runtimeTask.stageLabel}</span><span>{runtimeTask.progress}%</span></div><Progress value={runtimeTask.progress} />{runtimeTask.error ? <div className="mt-3 flex gap-2 text-xs text-red-500"><AlertCircle className="h-4 w-4 shrink-0" />{runtimeTask.error}</div> : null}</div>

              {segments.length ? <div><div className="mb-2 flex justify-between text-sm"><span className="font-medium">视频分段</span><span className="text-muted-foreground">{String(result.segmentsCompleted || 0)}/{String(result.segmentCount || segments.length)} 完成</span></div><div className="grid gap-2 sm:grid-cols-2">{segments.map((segment) => <div key={segment.index} className={`rounded-xl border p-3 text-xs ${segmentTone(segment.status)}`}><div className="flex items-center justify-between"><span className="font-medium">第 {segment.index + 1} 段</span><span>{segment.status}</span></div>{segment.error ? <p className="mt-2 line-clamp-2 opacity-80">{segment.error}</p> : null}{["failed", "timeout"].includes(segment.status) ? <Button className="mt-3 w-full" size="sm" variant="outline" disabled={retryingSegment === segment.index} onClick={() => void retrySegment(segment.index)}>{retryingSegment === segment.index ? <Loader2 className="animate-spin" /> : <RotateCcw />}重试（200 积分）</Button> : null}</div>)}</div></div> : null}

              {videoUrl ? <div className="space-y-3"><video controls className="max-h-[520px] w-full rounded-2xl bg-black" src={resolveMediaUrl(videoUrl)} /><div className="flex flex-wrap gap-2"><Button asChild><a href={resolveMediaUrl(videoUrl)} target="_blank" rel="noreferrer" download><Download />下载完整视频</a></Button>{coverUrl ? <Button asChild variant="outline"><a href={resolveMediaUrl(coverUrl)} target="_blank" rel="noreferrer" download><Download />下载封面</a></Button> : null}</div></div> : null}

              <div className="rounded-2xl border p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-medium">{coverStatus === "success" ? <CheckCircle2 className="text-emerald-500" /> : coverStatus === "running" ? <Loader2 className="animate-spin text-sky-500" /> : <AlertCircle className="text-amber-500" />}封面图</div>{coverStatus === "failed" && runtimeTask ? <Button size="sm" variant="outline" onClick={() => startCover(runtimeTask.taskId)}><RefreshCw />重试封面</Button> : null}</div>{coverError ? <p className="mt-2 text-xs text-red-500">{coverError}</p> : null}{coverUrl ? <img src={resolveMediaUrl(coverUrl)} alt="视频封面" className="mt-3 max-h-80 w-full rounded-xl object-contain" /> : null}</div>
            </>}
          </section>
        </div>
      </div>
    </div>
  )
}
