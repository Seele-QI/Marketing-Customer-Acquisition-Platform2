"use client"

import * as React from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  Lightbulb,
  Sparkles,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { TutorialScenario, TutorialStep } from "@/lib/tutorial/types"

type Props = {
  scenario: TutorialScenario
  step: TutorialStep
  stepIndex: number
  onNext: () => void
  onPrev: () => void
  onExit: () => void
  onComplete: () => void
  onShowDemo?: (fixtureKey: string) => void
}

/**
 * 底部引导浮层 — 工作流版：检查清单 / 流程图 / tip / warning / 本步示例
 */
export function TutorialOverlay({
  scenario,
  step,
  stepIndex,
  onNext,
  onPrev,
  onExit,
  onComplete,
  onShowDemo,
}: Props) {
  const [spotlight, setSpotlight] = React.useState<DOMRect | null>(null)
  const [showFlowchart, setShowFlowchart] = React.useState(false)
  const total = scenario.steps.length
  const isLast = stepIndex >= total - 1
  const flowchartSrc = step.flowchart ?? scenario.flowchart
  const demoFixture =
    step.action?.type === "showDemo"
      ? step.action.fixtureKey
      : scenario.fixtureKey

  React.useEffect(() => {
    setShowFlowchart(false)
  }, [stepIndex])

  React.useEffect(() => {
    const targetId = step.highlightTarget
    if (!targetId || typeof document === "undefined") {
      setSpotlight(null)
      return
    }
    const el = document.querySelector(`[data-tutorial-id="${CSS.escape(targetId)}"]`)
    if (!el) {
      setSpotlight(null)
      return
    }
    const update = () => setSpotlight(el.getBoundingClientRect())
    update()
    el.scrollIntoView({ block: "nearest", behavior: "smooth" })
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [step.highlightTarget, stepIndex])

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExit()
      if (e.key === "ArrowRight") onNext()
      if (e.key === "ArrowLeft") onPrev()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onExit, onNext, onPrev])

  return (
    <div className="pointer-events-none fixed inset-0 z-[80]" aria-live="polite">
      {spotlight ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-amber-400/90 ring-offset-2 ring-offset-transparent transition-all duration-300"
          style={{
            left: spotlight.left - 4,
            top: spotlight.top - 4,
            width: spotlight.width + 8,
            height: spotlight.height + 8,
            boxShadow: "0 0 0 9999px rgba(15, 23, 42, 0.45)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-slate-950/25" />
      )}

      <div
        className={cn(
          "pointer-events-auto absolute bottom-4 left-1/2 max-h-[min(78vh,640px)] w-[min(520px,calc(100vw-1.5rem))] -translate-x-1/2 overflow-y-auto",
          "rounded-2xl border border-amber-500/30 bg-background/95 p-4 shadow-2xl backdrop-blur-md",
          "dark:border-amber-400/20",
        )}
        role="dialog"
        aria-label="工作流引导教程"
      >
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <p className="text-[11px] font-medium text-muted-foreground">
                {scenario.title} · {stepIndex + 1}/{total}
                {scenario.kind === "workflow" || scenario.kind === "prep"
                  ? " · 工作流"
                  : null}
              </p>
              <h2 className="text-[15px] font-semibold text-foreground">{step.title}</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="退出教程"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>

        {step.checklist && step.checklist.length > 0 ? (
          <ul className="mb-3 space-y-1.5 rounded-xl bg-muted/50 p-3">
            {step.checklist.map((item) => (
              <li key={item} className="flex gap-2 text-[12px] text-foreground/90">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        ) : null}

        {step.tip ? (
          <div className="mb-2 flex gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 py-2 text-[12px] text-sky-900 dark:text-sky-100">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{step.tip}</span>
          </div>
        ) : null}

        {step.warning ? (
          <div className="mb-2 flex gap-2 rounded-lg border border-amber-600/30 bg-amber-500/10 px-2.5 py-2 text-[12px] text-amber-950 dark:text-amber-100">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{step.warning}</span>
          </div>
        ) : null}

        {step.expectedOutcome ? (
          <p className="mb-2 text-[12px] font-medium text-foreground">
            本步成果：{step.expectedOutcome}
          </p>
        ) : null}

        {flowchartSrc ? (
          <div className="mb-3">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-border/60 px-2.5 py-1.5 text-[12px] text-muted-foreground hover:bg-muted/60"
              onClick={() => setShowFlowchart((v) => !v)}
            >
              <span className="inline-flex items-center gap-1.5">
                <ImageIcon className="h-3.5 w-3.5" />
                {showFlowchart ? "收起流程图" : "展开流程图"}
              </span>
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform", showFlowchart && "rotate-180")}
              />
            </button>
            {showFlowchart ? (
              <div className="mt-2 overflow-hidden rounded-xl border border-border/50 bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={flowchartSrc}
                  alt={`${scenario.title}流程图`}
                  className="h-auto w-full object-contain"
                />
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-amber-500 transition-all"
            style={{ width: `${((stepIndex + 1) / total) * 100}%` }}
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onPrev}
            disabled={stepIndex === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            上一步
          </Button>
          <div className="flex flex-wrap gap-2">
            {demoFixture && onShowDemo ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onShowDemo(demoFixture)}
              >
                本步查看示例
              </Button>
            ) : null}
            <Button type="button" variant="outline" size="sm" onClick={onExit}>
              稍后再说
            </Button>
            {isLast ? (
              <Button
                type="button"
                size="sm"
                onClick={onComplete}
                className="bg-amber-600 hover:bg-amber-700"
              >
                完成
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                onClick={onNext}
                className="gap-1 bg-amber-600 hover:bg-amber-700"
              >
                下一步
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
