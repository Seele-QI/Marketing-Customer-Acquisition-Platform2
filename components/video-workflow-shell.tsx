"use client"

import * as React from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type WorkflowStepId = 1 | 2 | 3 | 4
export type WorkflowStepStatus = "pending" | "active" | "loading" | "done" | "error"

export type ClipStepId = 1 | 2 | 3

export const CLIP_STEP_LABELS: { id: ClipStepId; label: string }[] = [
  { id: 1, label: "素材准备" },
  { id: 2, label: "配音生成" },
  { id: 3, label: "视频合成" },
]

export function clipStepStatus(
  stepId: ClipStepId,
  currentStep: ClipStepId,
  isProcessing: boolean,
  hasResult: boolean,
  hasError: boolean,
): WorkflowStepStatus {
  if (stepId < currentStep) return "done"
  if (stepId > currentStep) return "pending"
  if (stepId === 3 && !isProcessing && hasResult) return "done"
  if (stepId === 3 && !isProcessing && hasError) return "error"
  return isProcessing ? "loading" : "active"
}

export function buildClipSteps(
  currentStep: ClipStepId,
  isProcessing: boolean,
  hasResult: boolean,
  hasError: boolean,
): { id: ClipStepId; label: string; status: WorkflowStepStatus }[] {
  return CLIP_STEP_LABELS.map((step) => ({
    ...step,
    status: clipStepStatus(step.id, currentStep, isProcessing, hasResult, hasError),
  }))
}

export type WorkflowAccent = "rose" | "emerald" | "violet"

const ACCENT = {
  rose: {
    bar: "bg-rose-500/60",
    title: "text-rose-500 dark:text-rose-400",
    loading: "bg-rose-500 text-white",
    active: "bg-rose-100 text-rose-600 ring-2 ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-400",
    activeLabel: "text-rose-600 dark:text-rose-400",
    iconBg: "bg-rose-50 dark:bg-rose-500/10",
    icon: "text-rose-400",
    drag: "border-rose-400 bg-rose-50/50 dark:border-rose-500/40 dark:bg-rose-500/5",
  },
  emerald: {
    bar: "bg-emerald-500/60",
    title: "text-emerald-500 dark:text-emerald-400",
    loading: "bg-emerald-500 text-white",
    active: "bg-emerald-100 text-emerald-600 ring-2 ring-emerald-500/30 dark:bg-emerald-500/20 dark:text-emerald-400",
    activeLabel: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
    icon: "text-emerald-400",
    drag: "border-emerald-400 bg-emerald-50/50 dark:border-emerald-500/40 dark:bg-emerald-500/5",
  },
  violet: {
    bar: "bg-violet-500/60",
    title: "text-violet-500 dark:text-violet-400",
    loading: "bg-violet-500 text-white",
    active: "bg-violet-100 text-violet-600 ring-2 ring-violet-500/30 dark:bg-violet-500/20 dark:text-violet-400",
    activeLabel: "text-violet-600 dark:text-violet-400",
    iconBg: "bg-violet-50 dark:bg-violet-500/10",
    icon: "text-violet-400",
    drag: "border-violet-400 bg-violet-50/50 dark:border-violet-500/40 dark:bg-violet-500/5",
  },
} as const

export function VideoWorkflowPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">{children}</div>
    </div>
  )
}

export function WorkflowHero({
  title,
  accent,
  accentWord,
  description,
  accentColor = "rose",
}: {
  title: string
  accent?: string
  accentWord?: string
  description: string
  accentColor?: WorkflowAccent
}) {
  const a = ACCENT[accentColor]
  return (
    <header className="mb-8">
      <div className={cn("mb-4 h-1 w-12 rounded-full", a.bar)} />
      <h1 className="text-[28px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[34px] dark:text-slate-50">
        {title}
        {accentWord ? (
          <span className={a.title}> {accentWord}</span>
        ) : accent ? (
          <span className={a.title}> {accent}</span>
        ) : null}
      </h1>
      <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </header>
  )
}

export function WorkflowStepIndicator({
  steps,
  accentColor = "rose",
}: {
  steps: { id: WorkflowStepId; label: string; status: WorkflowStepStatus }[]
  accentColor?: WorkflowAccent
}) {
  const a = ACCENT[accentColor]
  return (
    <div className="flex items-center gap-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                step.status === "done"
                  ? "bg-emerald-500 text-white"
                  : step.status === "loading"
                    ? a.loading
                    : step.status === "active"
                      ? a.active
                      : step.status === "error"
                        ? "bg-red-100 text-red-600 ring-2 ring-red-500/30 dark:bg-red-500/20 dark:text-red-400"
                        : "bg-slate-100 text-slate-400 dark:bg-white/5",
              )}
            >
              {step.status === "loading" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : step.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : step.status === "error" ? (
                "!"
              ) : (
                step.id
              )}
            </span>
            <span
              className={cn(
                "text-[12px] font-medium",
                step.status === "active" || step.status === "loading"
                  ? a.activeLabel
                  : "text-slate-500",
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={cn(
                "h-px w-6",
                step.status === "done" ? "bg-emerald-300" : "bg-slate-200 dark:bg-white/10",
              )}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}

export function UploadZone({
  accept,
  label,
  icon: Icon,
  hint,
  disabled,
  onFile,
  accentColor = "rose",
}: {
  accept: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  hint: string
  disabled?: boolean
  onFile: (file: File) => void
  accentColor?: WorkflowAccent
}) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = React.useState(false)
  const a = ACCENT[accentColor]

  return (
    <div
      className={cn(
        "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed p-6 transition-all",
        dragOver
          ? a.drag
          : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/50 dark:border-white/10 dark:bg-white/5 dark:hover:border-white/20",
        disabled && "pointer-events-none opacity-40",
      )}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const f = e.dataTransfer.files[0]
        if (f) onFile(f)
      }}
    >
      <span className={cn("flex h-10 w-10 items-center justify-center rounded-xl", a.iconBg)}>
        <Icon className={cn("h-5 w-5", a.icon)} />
      </span>
      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) onFile(f)
        }}
      />
    </div>
  )
}
