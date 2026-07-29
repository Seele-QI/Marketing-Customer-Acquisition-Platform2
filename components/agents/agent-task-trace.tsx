"use client"

import {
  Check,
  Circle,
  Loader2,
  Minus,
  Route,
  TriangleAlert,
} from "lucide-react"

import type {
  AgentTaskTraceStatus,
  AgentTaskTraceStep,
} from "@/lib/agents/task-trace"
import { cn } from "@/lib/utils"

const statusMeta: Record<
  AgentTaskTraceStatus,
  { label: string; className: string }
> = {
  queued: { label: "等待", className: "text-slate-400" },
  active: { label: "处理中", className: "text-blue-700 dark:text-blue-300" },
  completed: { label: "已完成", className: "text-emerald-700 dark:text-emerald-300" },
  failed: { label: "未完成", className: "text-rose-700 dark:text-rose-300" },
  skipped: { label: "已跳过", className: "text-slate-400" },
}

function StatusIcon({ status }: { status: AgentTaskTraceStatus }) {
  if (status === "active") return <Loader2 className="h-4 w-4 animate-spin" />
  if (status === "completed") return <Check className="h-4 w-4" />
  if (status === "failed") return <TriangleAlert className="h-4 w-4" />
  if (status === "skipped") return <Minus className="h-4 w-4" />
  return <Circle className="h-3.5 w-3.5" />
}

export function AgentTaskTrace({ steps }: { steps: readonly AgentTaskTraceStep[] }) {
  if (!steps.length) return null

  return (
    <section
      aria-label="任务处理链"
      className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_10px_35px_rgba(15,23,42,.06)] dark:border-slate-800 dark:bg-slate-950"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Route className="h-4 w-4 text-blue-700 dark:text-blue-300" />
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
            任务处理链
          </h3>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          业务事件 · 非思维链
        </span>
      </div>

      <ol className="px-5 py-2">
        {steps.map((step, index) => {
          const meta = statusMeta[step.status]
          return (
            <li key={step.id} className="relative flex gap-3 py-3">
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[15px] top-9 h-[calc(100%-1.15rem)] w-px bg-slate-200 dark:bg-slate-800"
                />
              ) : null}
              <span
                className={cn(
                  "relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full border bg-white dark:bg-slate-950",
                  step.status === "active" && "border-blue-300 bg-blue-50",
                  step.status === "completed" && "border-emerald-300 bg-emerald-50",
                  step.status === "failed" && "border-rose-300 bg-rose-50",
                  (step.status === "queued" || step.status === "skipped") &&
                    "border-slate-200",
                  meta.className,
                )}
              >
                <StatusIcon status={step.status} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {step.label}
                  </p>
                  <span className={cn("shrink-0 text-[10px] font-semibold", meta.className)}>
                    {meta.label}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                  {step.detail}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
