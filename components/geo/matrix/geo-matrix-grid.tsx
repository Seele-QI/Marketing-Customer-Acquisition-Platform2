"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import type { MatrixCell } from "@/lib/geo/matrix-types"
import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"

const ARC_COLORS = [
  "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300",
]

function arcColor(themeArc: string): string {
  let h = 0
  for (let i = 0; i < themeArc.length; i++) h = (h + themeArc.charCodeAt(i)) % ARC_COLORS.length
  return ARC_COLORS[h] ?? ARC_COLORS[0]
}

function formatDateLabel(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00")
    const wd = ["日", "一", "二", "三", "四", "五", "六"][d.getDay()]
    return `${d.getMonth() + 1}/${d.getDate()} 周${wd}`
  } catch {
    return iso
  }
}

type Props = {
  platformId: string
  cells: MatrixCell[]
  onCellClick: (cell: MatrixCell) => void
  empty?: boolean
}

export function GeoMatrixGrid({ platformId, cells, onCellClick, empty }: Props) {
  if (empty || cells.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center dark:border-white/10 dark:bg-white/[0.02]">
        <p className="text-[13px] font-medium text-slate-600 dark:text-slate-400">
          {getMatrixPlatformLabel(platformId)} 暂无矩阵数据
        </p>
        <p className="mt-1 text-[12px] text-slate-500">请先配置发布平台与内容策略，点击「生成两周矩阵」</p>
      </div>
    )
  }

  const w1 = cells.filter((c) => c.week === 1)
  const w2 = cells.filter((c) => c.week === 2)

  const renderWeek = (label: string, weekCells: MatrixCell[]) => (
    <div className="mb-4">
      <h4 className="mb-2 text-[12px] font-semibold text-slate-500">{label}</h4>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {weekCells.map((cell, idx) => (
          <button
            key={`${cell.date}-${idx}`}
            type="button"
            onClick={() => onCellClick(cell)}
            className={cn(
              "rounded-xl border border-slate-200/80 bg-white p-3 text-left transition-shadow",
              "hover:shadow-md hover:ring-1 hover:ring-cyan-200 dark:border-white/10 dark:bg-white/[0.03]",
            )}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">{formatDateLabel(cell.date)}</span>
              <span className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", arcColor(cell.themeArc))}>
                {cell.themeArc}
              </span>
            </div>
            <p className="line-clamp-2 text-[13px] font-medium text-slate-800 dark:text-slate-200">
              {cell.title}
            </p>
            <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{cell.format} · {cell.geoIntent}</p>
          </button>
        ))}
      </div>
    </div>
  )

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
      {renderWeek("第一周 · 立题", w1.length ? w1 : cells.slice(0, Math.ceil(cells.length / 2)))}
      {renderWeek("第二周 · 深化", w2.length ? w2 : cells.slice(Math.ceil(cells.length / 2)))}
    </div>
  )
}
