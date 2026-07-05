"use client"

import * as React from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"

export type GeoWorkflowStepId = 1 | 2 | 3 | 4
export type GeoWorkflowStepStatus = "pending" | "active" | "loading" | "done" | "error"

export type GeoWorkflowAccent = "cyan"

const ACCENT = {
  cyan: {
    bar: "bg-cyan-500/60",
    title: "text-cyan-500 dark:text-cyan-400",
    loading: "bg-cyan-500 text-white",
    active:
      "bg-cyan-100 text-cyan-600 ring-2 ring-cyan-500/30 dark:bg-cyan-500/20 dark:text-cyan-400",
    activeLabel: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-50 dark:bg-cyan-500/10",
    icon: "text-cyan-400",
    drag: "border-cyan-400 bg-cyan-50/50 dark:border-cyan-500/40 dark:bg-cyan-500/5",
  },
} as const

export function GeoWorkflowPage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full overflow-y-auto bg-[#fafaf8] dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-5 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  )
}

export function GeoWorkflowHero({
  title,
  accentWord,
  description,
  trailing,
}: {
  title: string
  accentWord?: string
  description: string
  trailing?: React.ReactNode
}) {
  const a = ACCENT.cyan
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className={cn("mb-3 h-0.5 w-10 rounded-full", a.bar)} />
          <h1 className="text-[26px] font-bold leading-tight tracking-tight text-slate-900 sm:text-[30px] dark:text-slate-50">
            {title}
            {accentWord ? <span className={a.title}> {accentWord}</span> : null}
          </h1>
          <p className="mt-2 max-w-lg text-[14px] leading-relaxed text-slate-500 dark:text-slate-400">
            {description}
          </p>
        </div>
        {trailing ? <div className="shrink-0 pt-1">{trailing}</div> : null}
      </div>
    </header>
  )
}

export function GeoWorkflowStepIndicator({
  steps,
  onStepClick,
}: {
  steps: { id: GeoWorkflowStepId; label: string; status: GeoWorkflowStepStatus }[]
  onStepClick?: (stepId: GeoWorkflowStepId) => void
}) {
  const a = ACCENT.cyan
  const interactive = Boolean(onStepClick)

  return (
    <nav aria-label="GEO 创作流程" className="flex flex-wrap items-center gap-1 sm:gap-2">
      {steps.map((step, i) => {
        const isClickable = interactive && step.status !== "loading"
        const StepWrapper = isClickable ? "button" : "div"

        return (
          <React.Fragment key={step.id}>
            <StepWrapper
              {...(isClickable
                ? {
                    type: "button" as const,
                    onClick: () => onStepClick?.(step.id),
                    "aria-current": step.status === "active" ? ("step" as const) : undefined,
                    className: cn(
                      "group flex items-center gap-1.5 rounded-lg px-1 py-0.5 transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40",
                      step.status === "active"
                        ? "cursor-default"
                        : "cursor-pointer hover:bg-slate-100/80 dark:hover:bg-white/5",
                    ),
                  }
                : { className: "flex items-center gap-1.5" })}
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold transition-all",
                  step.status === "done"
                    ? "bg-emerald-500 text-white"
                    : step.status === "loading"
                      ? a.loading
                      : step.status === "active"
                        ? a.active
                        : step.status === "error"
                          ? "bg-red-100 text-red-600 ring-2 ring-red-500/30 dark:bg-red-500/20 dark:text-red-400"
                          : "bg-slate-100 text-slate-400 group-hover:bg-slate-200 dark:bg-white/5 dark:group-hover:bg-white/10",
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
                    : "text-slate-500 dark:text-slate-400",
                )}
              >
                {step.label}
              </span>
            </StepWrapper>
            {i < steps.length - 1 && (
              <div
                aria-hidden
                className={cn(
                  "mx-0.5 hidden h-px w-4 sm:block sm:w-6",
                  step.status === "done" ? "bg-emerald-300/80" : "bg-slate-200 dark:bg-white/10",
                )}
              />
            )}
          </React.Fragment>
        )
      })}
    </nav>
  )
}

export const GEO_ARTICLE_STEPS = [
  { id: 1 as const, label: "选题" },
  { id: 2 as const, label: "起草" },
  { id: 3 as const, label: "GEO 优化" },
  { id: 4 as const, label: "导出" },
]

export function buildGeoArticleSteps(
  currentStep: GeoWorkflowStepId,
  options?: { loadingStep?: GeoWorkflowStepId },
): { id: GeoWorkflowStepId; label: string; status: GeoWorkflowStepStatus }[] {
  return GEO_ARTICLE_STEPS.map((step) => {
    if (options?.loadingStep === step.id) {
      return { ...step, status: "loading" as const }
    }
    return {
      ...step,
      status:
        step.id < currentStep ? "done" : step.id === currentStep ? "active" : "pending",
    }
  })
}
