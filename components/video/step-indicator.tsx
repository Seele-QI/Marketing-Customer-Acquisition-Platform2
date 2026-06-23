/**
 * 步骤指示器 — 视频创作流程顶部的 4 步进度条
 */
import * as React from "react"
import { cn } from "@/lib/utils"
import { CheckCircle2, Loader2 } from "lucide-react"
import type { StepId, StepStatus } from "@/lib/video/types"

export type Step = {
  id: StepId
  label: string
  status: StepStatus
}

export function StepIndicator({ steps }: { steps: Step[] }) {
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
                    ? "bg-rose-500 text-white"
                    : step.status === "active"
                      ? "bg-rose-100 text-rose-600 ring-2 ring-rose-500/30 dark:bg-rose-500/20 dark:text-rose-400"
                      : "bg-slate-100 text-slate-400 dark:bg-white/5",
              )}
            >
              {step.status === "loading" ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : step.status === "done" ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                step.id
              )}
            </span>
            <span
              className={cn(
                "text-[12px] font-medium",
                step.status === "active" ? "text-rose-600 dark:text-rose-400" : "text-slate-500",
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
