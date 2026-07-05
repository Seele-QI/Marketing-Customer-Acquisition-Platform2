"use client"

import * as React from "react"
import { ChevronDown, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"
import { getGeoSkillById } from "@/lib/geo/skills-registry"

const SKILL_ID = "content-matrix-planning"

type Props = {
  generated?: boolean
  className?: string
}

export function GeoMatrixSkillBanner({ generated, className }: Props) {
  const [open, setOpen] = React.useState(false)
  const skill = React.useMemo(() => getGeoSkillById(SKILL_ID), [])

  return (
    <div
      className={cn(
        "rounded-xl border border-cyan-200/80 bg-cyan-50/40 p-4 dark:border-cyan-500/25 dark:bg-cyan-500/10",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-cyan-500" />
          <div>
            <p className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">
              正在使用「{skill?.label ?? "内容矩阵规划"}」Skill
            </p>
            <p className="mt-1 text-[12px] text-slate-600 dark:text-slate-400">
              {generated
                ? "本次规划已应用内容矩阵规划准则：跨平台主题弧 + 平台原生改写。"
                : (skill?.description ??
                  "两周跨平台 GEO 内容矩阵：主题关联、平台差异化与 Sprint 节奏。")}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex shrink-0 items-center gap-1 text-[11px] text-cyan-600 dark:text-cyan-400"
        >
          查看准则
          <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
        </button>
      </div>
      {open && (
        <div className="mt-3 rounded-lg border border-cyan-100 bg-white/80 p-3 text-[11px] leading-relaxed text-slate-600 dark:border-cyan-500/20 dark:bg-slate-900/50 dark:text-slate-400">
          <ul className="list-inside list-disc space-y-1">
            <li>硬规则：跨平台 themeArc 关联，禁止一字不差多平台粘贴</li>
            <li>W1 立题 → W2 深化/转化，每平台恰好 14 内容位（一日一格）</li>
            <li>证据与体验分离，geoIntent 对齐 AI 引擎问法</li>
            <li>完整文档：skills/geo/creation-guidelines/content-matrix-planning/</li>
          </ul>
        </div>
      )}
    </div>
  )
}
