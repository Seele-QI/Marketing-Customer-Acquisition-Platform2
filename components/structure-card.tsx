"use client"

import { Scissors } from "lucide-react"
import { cn } from "@/lib/utils"

export type StructureCardStep = {
  phase: string
  percent: number
  summary: string
  /** 与逐字稿对应的口播摘录（有逐字稿时由模型从原文截取，用于对照各阶段） */
  evidenceLines?: string[]
}

const MOCK_STRUCTURE: StructureCardStep[] = [
  { phase: "引入", percent: 12, summary: "反常识提问 + 数据困境，快速锁定目标受众" },
  { phase: "痛点", percent: 24, summary: "解释低转化根因，制造「我也这样」的强代入" },
  { phase: "方案", percent: 41, summary: "给可复制话术与节奏，直接提升执行意愿" },
  { phase: "升华（CTA）", percent: 23, summary: "低门槛行动指令 + 下一条预告，促进互动与追更" },
]

export type StructureCardProps = {
  steps?: StructureCardStep[]
  className?: string
}

/**
 * 卡片 3 · 爆款结构拆解：阶段名 + 百分比 + 渐变进度条 + 一句话解析
 */
export function StructureCard({ steps = MOCK_STRUCTURE, className }: StructureCardProps) {
  return (
    <article
      className={cn(
        "flex min-h-[220px] flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04] sm:p-5",
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <Scissors className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <h3 className="text-sm font-bold text-foreground">爆款结构拆解（Structure）</h3>
      </div>
      <div className="space-y-3">
        {steps.map((step, idx) => (
          <div key={`${idx}-${step.phase}`} className="rounded-xl border border-border/60 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-bold text-foreground">{step.phase}</p>
              <p className="text-xs font-semibold tabular-nums text-primary">{step.percent}%</p>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-600 to-violet-600 transition-[width] duration-500"
                style={{ width: `${step.percent}%` }}
              />
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{step.summary}</p>
            {step.evidenceLines && step.evidenceLines.length > 0 ? (
              <div className="mt-2.5 rounded-lg border border-border/50 bg-muted/25 px-2.5 py-2 dark:bg-muted/20">
                <p className="mb-0.5 text-[10px] font-semibold text-muted-foreground">本阶段话术示例</p>
                <p className="mb-1.5 text-[9px] leading-snug text-muted-foreground/85">
                  由 AI 生成，辅助理解该段口播节奏（非官方字幕、不保证与原片一致）
                </p>
                <ul className="space-y-1.5">
                  {step.evidenceLines.map((line, li) => (
                    <li
                      key={`${idx}-${li}-${line.slice(0, 24)}`}
                      className="border-l-2 border-primary/40 pl-2 text-[11px] leading-relaxed text-foreground/90"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </article>
  )
}
