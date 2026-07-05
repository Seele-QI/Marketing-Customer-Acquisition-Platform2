"use client"

import * as React from "react"
import { BarChart3 } from "lucide-react"
import { cn } from "@/lib/utils"

export type GeoScores = {
  semanticClarity: number
  conversationalTone: number
  evidenceDensity: number
  structuredFaq: number
}

const DEFAULT_SCORES: GeoScores = {
  semanticClarity: 72,
  conversationalTone: 65,
  evidenceDensity: 48,
  structuredFaq: 80,
}

const SCORE_LABELS: { key: keyof GeoScores; label: string; hint: string }[] = [
  { key: "semanticClarity", label: "语义清晰度", hint: "H2 结构、概念定义、上下文线索" },
  { key: "conversationalTone", label: "对话语气", hint: "第二人称、自然问答节奏" },
  { key: "evidenceDensity", label: "证据密度", hint: "可验证数据点、来源引用" },
  { key: "structuredFaq", label: "结构化 FAQ", hint: "FAQ 块与 FAQPage 标记" },
]

type GeoScorePanelProps = {
  scores?: GeoScores
  className?: string
}

function scoreColor(value: number): string {
  if (value >= 75) return "bg-emerald-500"
  if (value >= 50) return "bg-cyan-500"
  return "bg-amber-500"
}

export function GeoScorePanel({ scores = DEFAULT_SCORES, className }: GeoScorePanelProps) {
  const overall = Math.round(
    (scores.semanticClarity +
      scores.conversationalTone +
      scores.evidenceDensity +
      scores.structuredFaq) /
      4,
  )

  return (
    <section
      aria-label="GEO 四维评分"
      className={cn(
        "rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-white/10 dark:bg-white/[0.03]",
        className,
      )}
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-cyan-600 dark:text-cyan-400" aria-hidden />
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">GEO 评分</span>
        </div>
        <div className="text-right">
          <span className="text-[20px] font-bold tabular-nums text-cyan-600 dark:text-cyan-400">
            {overall}
          </span>
          <span className="ml-0.5 text-[11px] text-slate-400">/100</span>
        </div>
      </div>

      <div className="space-y-2.5">
        {SCORE_LABELS.map(({ key, label, hint }) => {
          const value = scores[key]
          return (
            <div key={key}>
              <div className="mb-1 flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
                <span className="tabular-nums text-slate-400">{value}%</span>
              </div>
              <div
                className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-white/10"
                role="progressbar"
                aria-valuenow={value}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={label}
              >
                <div
                  className={cn("h-full rounded-full transition-all", scoreColor(value))}
                  style={{ width: `${value}%` }}
                />
              </div>
              <p className="mt-0.5 text-[10px] leading-snug text-slate-400">{hint}</p>
            </div>
          )
        })}
      </div>
    </section>
  )
}
