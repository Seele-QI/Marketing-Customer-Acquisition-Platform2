"use client"

import * as React from "react"
import {
  FileText,
  Link as LinkIcon,
  Loader2,
  Copy,
  Check,
  Wand2,
  Clapperboard,
  AlertCircle,
  ExternalLink,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { startCopyExtraction } from "@/lib/video/api"
import type { ExtractCopyStatusResponse } from "@/lib/video/api"
import { extractVideoUrlFromShareText } from "@/lib/video/utils"
import { useRuntimeTask, useTaskRuntimeApi } from "@/lib/task-runtime"
import {
  loadDraft,
  saveDraft,
} from "@/lib/workflow-draft-store"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { guardDemoAction } from "@/lib/tutorial/demo-mode"

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Props = {
  /** 跳转至视频创作板块（携带提取的文案） */
  onJumpToVideo?: (script: string) => void
  /** 跳转至 AI 改写（携带提取的文案） */
  onAiRewrite?: (text: string) => void
}

type ExtractionStatus = "idle" | "submitting" | "downloading" | "transcribing" | "completed" | "failed"

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const PLATFORM_HINTS = "抖音 · B站 · 快手 · 小红书 · YouTube"

const STEP_LABELS: Record<ExtractionStatus, string> = {
  idle: "",
  submitting: "提交中",
  downloading: "下载中",
  transcribing: "识别中",
  completed: "完成",
  failed: "失败",
}

/* ------------------------------------------------------------------ */
/*  CopywritingExtractView                                             */
/* ------------------------------------------------------------------ */

export default function CopywritingExtractView({ onJumpToVideo, onAiRewrite }: Props) {
  const runtimeApi = useTaskRuntimeApi()
  const runtimeTask = useRuntimeTask("copywriting-extract")

  /* ── State ── */
  const [url, setUrl] = React.useState(() => loadDraft("copywriting-extract")?.url ?? "")
  const [taskId, setTaskId] = React.useState("")
  const [status, setStatus] = React.useState<ExtractionStatus>("idle")
  const [progress, setProgress] = React.useState(0)
  const [result, setResult] = React.useState<ExtractCopyStatusResponse | null>(null)
  const [error, setError] = React.useState("")
  const [copied, setCopied] = React.useState(false)
  const [editedText, setEditedText] = React.useState(
    () => loadDraft("copywriting-extract")?.editedText ?? "",
  )
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  React.useEffect(() => {
    saveDraft("copywriting-extract", { url, editedText })
  }, [url, editedText])

  const isRunning =
    isSubmitting || status === "downloading" || status === "transcribing"

  // 从全局 runtime 恢复 / 同步
  React.useEffect(() => {
    if (!runtimeTask) return
    setTaskId(runtimeTask.taskId)
    setProgress(runtimeTask.progress)
    if (typeof runtimeTask.meta?.url === "string" && runtimeTask.meta.url) {
      setUrl(runtimeTask.meta.url)
    }

    if (runtimeTask.status === "running") {
      setIsSubmitting(false)
      const step = (runtimeTask.stageLabel || "").includes("识别")
        ? "transcribing"
        : (runtimeTask.stageLabel || "").includes("提交")
          ? "submitting"
          : "downloading"
      setStatus(step)
      setError("")
      return
    }
    if (runtimeTask.status === "success") {
      setStatus("completed")
      const text = String(runtimeTask.result?.text ?? "")
      const data: ExtractCopyStatusResponse = {
        task_id: runtimeTask.taskId,
        status: "completed",
        step: runtimeTask.stageLabel || "完成",
        progress: 100,
        text,
        title: String(runtimeTask.result?.title ?? ""),
        duration:
          typeof runtimeTask.result?.duration === "number"
            ? runtimeTask.result.duration
            : undefined,
        source:
          typeof runtimeTask.result?.source === "string"
            ? runtimeTask.result.source
            : undefined,
      }
      setResult(data)
      setEditedText(text)
      setError("")
      return
    }
    if (runtimeTask.status === "failed") {
      setStatus("failed")
      setError(runtimeTask.error || "提取失败，请检查视频链接或重试")
    }
  }, [runtimeTask])

  /** 粘贴分享口令时自动抠出视频链接，避免文案干扰 */
  const handlePaste = React.useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData("text")
    const extracted = extractVideoUrlFromShareText(pasted)
    if (extracted && extracted !== pasted.trim()) {
      e.preventDefault()
      setUrl(extracted)
      toast({ description: "已从分享口令中识别视频链接" })
    }
  }, [])

  /* ── Submit ── */
  const handleExtract = React.useCallback(async () => {
    if (!guardDemoAction("copywriting-extract")) {
      toast({
        description: "演示模式已拦截真实提取。请在教程中心查看已保存示例。",
      })
      return
    }
    const trimmed = url.trim()
    if (!trimmed) {
      toast({ description: "请粘贴视频链接或分享口令" })
      return
    }

    const videoUrl = extractVideoUrlFromShareText(trimmed)
    if (!videoUrl) {
      const msg = "未识别到视频链接，请粘贴分享口令或单条视频链接"
      setError(msg)
      setStatus("failed")
      toast({ description: msg, variant: "destructive" })
      return
    }
    if (videoUrl !== trimmed) {
      setUrl(videoUrl)
    }

    if (runtimeApi.isRunning("copywriting-extract")) {
      toast({
        description: "已有提取任务进行中，请稍候",
        variant: "destructive",
      })
      return
    }

    // Reset
    setError("")
    setResult(null)
    setCopied(false)
    setEditedText("")
    setIsSubmitting(true)
    setStatus("submitting")
    setProgress(5)

    try {
      const res = await startCopyExtraction({ url: videoUrl })
      setTaskId(res.task_id)
      setStatus("downloading")
      setProgress(5)
      runtimeApi.register({
        kind: "copywriting-extract",
        taskId: res.task_id,
        progress: 5,
        stageLabel: "下载中",
        meta: { url: videoUrl, startedAt: Date.now() },
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交提取任务失败"
      setError(msg)
      setStatus("failed")
      toast({ description: msg, variant: "destructive" })
    } finally {
      setIsSubmitting(false)
    }
  }, [url, runtimeApi])

  /* ── Keyboard shortcut ── */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        if (!isRunning) handleExtract()
      }
    },
    [handleExtract, isRunning],
  )

  /* ── Copy ── */
  const handleCopy = React.useCallback(async () => {
    const text = editedText || result?.text || ""
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      toast({ description: "已复制到剪贴板" })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast({ description: "复制失败，请手动全选复制", variant: "destructive" })
    }
  }, [editedText, result])

  /* ── Render ── */
  return (
    <main className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl px-6 py-10">
        {/* ── Header ── */}
        <div className="mb-8 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">文案提取</h1>
            <p className="mt-2 text-[14px] text-muted-foreground">
              粘贴视频链接或分享口令，自动识别链接并提取口播文案。优先使用平台自带字幕，无字幕时通过语音识别提取。
            </p>
          </div>
          <ModuleTutorialButton view="文案提取" />
        </div>

        {/* ── Input Card ── */}
        <div className="rounded-2xl border border-border bg-card p-6">
          {/* URL Input */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                <LinkIcon className="h-4 w-4" />
              </span>
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onPaste={handlePaste}
                onKeyDown={handleKeyDown}
                placeholder="粘贴视频链接，或抖音等平台整段分享口令…"
                disabled={isRunning}
                className={cn(
                  "h-11 w-full rounded-xl border border-input bg-background pl-10 pr-4",
                  "text-[14px] placeholder:text-muted-foreground/60",
                  "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                  "disabled:opacity-60 disabled:cursor-not-allowed",
                )}
              />
            </div>
            <button
              type="button"
              onClick={handleExtract}
              disabled={isRunning || !url.trim()}
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-2 rounded-xl px-5 text-[14px] font-medium transition-colors",
                isRunning || !url.trim()
                  ? "cursor-not-allowed bg-muted text-muted-foreground"
                  : "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97]",
              )}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <FileText className="h-4 w-4" />
              )}
              {isSubmitting ? "提交中…" : isRunning ? "提取中…" : "提取文案"}
            </button>
          </div>
          <p className="mt-2.5 ml-1 text-[12px] text-muted-foreground/70">
            支持：{PLATFORM_HINTS}
          </p>

          {/* ── Progress ── */}
          {status !== "idle" && status !== "completed" && status !== "failed" && (
            <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-5">
              <div className="flex items-center justify-between mb-3">
                <StepIndicator current={status} />
                <span className="text-[13px] font-medium text-muted-foreground">
                  {progress}%
                </span>
              </div>
              {/* Progress bar */}
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700 ease-out"
                  style={{ width: `${Math.min(progress, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {status === "failed" && error && (
            <div className="mt-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-950/30">
              <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
              <div>
                <p className="text-[14px] font-medium text-red-700 dark:text-red-400">
                  提取失败
                </p>
                <p className="mt-1 text-[13px] text-red-600 dark:text-red-300">
                  {error}
                </p>
                <button
                  type="button"
                  onClick={handleExtract}
                  className="mt-3 text-[13px] font-medium text-red-600 underline underline-offset-2 hover:text-red-700 dark:text-red-400"
                >
                  重试
                </button>
              </div>
            </div>
          )}

          {/* ── Result ── */}
          {status === "completed" && result && (
            <div className="mt-6 space-y-4">
              {/* Video meta */}
              {result.title && (
                <div className="flex items-center gap-2 text-[13px] text-muted-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span className="truncate font-medium">{result.title}</span>
                  {result.duration != null && result.duration > 0 && (
                    <span className="shrink-0 text-[12px] opacity-70">
                      {formatDuration(result.duration)}
                    </span>
                  )}
                  {result.source && (
                    <span className="shrink-0 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                      {result.source === "subtitles" ? "字幕提取" : "语音识别"}
                    </span>
                  )}
                </div>
              )}

              {/* Editable textarea */}
              <div>
                <label className="mb-1.5 block text-[12px] font-medium text-muted-foreground">
                  提取文案（可编辑）
                </label>
                <textarea
                  value={editedText}
                  onChange={(e) => setEditedText(e.target.value)}
                  rows={Math.min(Math.max(Math.ceil((editedText.length || 80) / 60), 6), 24)}
                  className={cn(
                    "w-full resize-y rounded-xl border border-input bg-background px-4 py-3",
                    "text-[14px] leading-relaxed",
                    "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                    "placeholder:text-muted-foreground/50",
                  )}
                  placeholder="提取的文案将显示在这里…"
                />
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-2.5">
                {/* Copy */}
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!editedText}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-input px-3.5 py-2 text-[13px] font-medium transition-colors",
                    "hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                  {copied ? "已复制" : "复制文案"}
                </button>

                {/* AI Rewrite */}
                {onAiRewrite && (
                  <button
                    type="button"
                    onClick={() => onAiRewrite(editedText)}
                    disabled={!editedText.trim()}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
                      "bg-amber-100 text-amber-800 hover:bg-amber-200",
                      "dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                  >
                    <Wand2 className="h-4 w-4" />
                    AI 改写
                  </button>
                )}

                {/* Jump to Video Creation */}
                {onJumpToVideo && (
                  <button
                    type="button"
                    onClick={() => onJumpToVideo(editedText)}
                    disabled={!editedText.trim()}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-medium transition-colors",
                      "bg-primary/10 text-primary hover:bg-primary/20",
                      "disabled:opacity-40 disabled:cursor-not-allowed",
                    )}
                  >
                    <Clapperboard className="h-4 w-4" />
                    跳转视频创作
                  </button>
                )}
              </div>

              {/* Character count */}
              <p className="text-right text-[11px] text-muted-foreground/60">
                {editedText.length.toLocaleString()} 字
              </p>
            </div>
          )}
        </div>

        {/* ── Empty state tips ── */}
        {status === "idle" && (
          <div className="mt-8 rounded-2xl border border-border/40 bg-muted/20 p-6">
            <h3 className="text-[14px] font-semibold">使用提示</h3>
            <ul className="mt-3 space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>
                  <strong>字幕优先：</strong>
                  B站等有字幕的视频会直接提取字幕，速度极快且完全准确
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>
                  <strong>语音识别：</strong>
                  无字幕的视频会通过云端语音识别自动转为文字，支持中文
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>
                  <strong>分享口令：</strong>
                  可直接粘贴抖音等平台复制的整段分享文案，系统会自动识别其中的视频链接
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>
                  <strong>需要登录：</strong>
                  使用本功能需先登录账号
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/50" />
                <span>
                  <strong>改写与创作：</strong>
                  提取后可直接「AI 改写」优化文案，或「跳转视频创作」生成数字人视频
                </span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/*  StepIndicator                                                      */
/* ------------------------------------------------------------------ */

const STEPS: { key: ExtractionStatus; label: string }[] = [
  { key: "submitting", label: "提交中" },
  { key: "downloading", label: "下载中" },
  { key: "transcribing", label: "识别中" },
  { key: "completed", label: "完成" },
]

function StepIndicator({ current }: { current: ExtractionStatus }) {
  const activeKey =
    current === "submitting" ? "downloading" : current === "completed" ? "transcribing" : current
  const currentIdx = STEPS.findIndex((s) => s.key === activeKey)

  return (
    <div className="flex items-center gap-1.5">
      {STEPS.map((step, i) => {
        const isDone = i < currentIdx || (current === "submitting" && i === 0)
        const isActive =
          step.key === activeKey || (current === "submitting" && step.key === "submitting")
        const isPending = i > currentIdx && current !== "submitting"

        return (
          <React.Fragment key={step.key}>
            {i > 0 && (
              <span
                className={cn(
                  "h-px w-8 transition-colors",
                  isDone ? "bg-primary" : "bg-muted-foreground/20",
                )}
              />
            )}
            <span className="flex items-center gap-1.5">
              <span
                className={cn(
                  "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all",
                  isDone && "bg-primary text-primary-foreground",
                  isActive && "bg-primary text-primary-foreground shadow-sm",
                  isPending && "bg-muted text-muted-foreground",
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-[13px] font-medium transition-colors",
                  isActive && "text-foreground",
                  isDone && "text-primary",
                  isPending && "text-muted-foreground/50",
                )}
              >
                {step.label}
              </span>
            </span>
          </React.Fragment>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}
