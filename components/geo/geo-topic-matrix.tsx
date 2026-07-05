"use client"

import * as React from "react"
import { Grid3x3 } from "lucide-react"
import { cn } from "@/lib/utils"

const PLATFORMS = ["公众号", "知乎", "官网", "小红书", "视频号"] as const

const DEFAULT_PILLARS = [
  "AI 视频翻译",
  "多语言配音",
  "内容本地化",
  "字幕生成",
  "品牌出海",
]

type CellStatus = "planned" | "active" | "done" | "empty"

type MatrixCell = {
  frequency: string
  status: CellStatus
}

type GeoTopicMatrixProps = {
  className?: string
}

const STATUS_STYLES: Record<CellStatus, string> = {
  planned: "bg-slate-100 text-slate-500 dark:bg-white/5",
  active: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  done: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300",
  empty: "bg-transparent text-slate-300",
}

const STATUS_CYCLE: CellStatus[] = ["empty", "planned", "active", "done"]

export function GeoTopicMatrix({ className }: GeoTopicMatrixProps) {
  const [matrix, setMatrix] = React.useState<Record<string, MatrixCell>>(() => {
    const init: Record<string, MatrixCell> = {}
    DEFAULT_PILLARS.forEach((pillar, pi) => {
      PLATFORMS.forEach((platform, qi) => {
        const key = `${pillar}-${platform}`
        const statuses: CellStatus[] = ["active", "planned", "done", "empty", "active"]
        init[key] = {
          frequency: pi === 0 && qi < 2 ? "周更" : qi === 2 ? "月更" : "",
          status: statuses[(pi + qi) % statuses.length],
        }
      })
    })
    return init
  })

  const cycleStatus = (key: string) => {
    setMatrix((prev) => {
      const cell = prev[key] ?? { frequency: "", status: "empty" as CellStatus }
      const idx = STATUS_CYCLE.indexOf(cell.status)
      const next = STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]
      return { ...prev, [key]: { ...cell, status: next } }
    })
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-white/5">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-50 dark:bg-cyan-500/10">
          <Grid3x3 className="h-3.5 w-3.5 text-cyan-500" />
        </span>
        <div>
          <span className="text-[13px] font-semibold text-slate-800 dark:text-slate-200">主题 × 平台矩阵</span>
          <p className="text-[11px] text-slate-500">点击单元格切换状态 · 规划发布频率</p>
        </div>
      </div>

      <div className="overflow-x-auto p-4">
        <table className="w-full min-w-[520px] text-[11px]">
          <thead>
            <tr>
              <th className="px-2 py-2 text-left font-medium text-slate-500">内容支柱</th>
              {PLATFORMS.map((p) => (
                <th key={p} className="px-2 py-2 text-center font-medium text-slate-500">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DEFAULT_PILLARS.map((pillar) => (
              <tr key={pillar}>
                <td className="px-2 py-2 font-medium text-slate-700 dark:text-slate-300">{pillar}</td>
                {PLATFORMS.map((platform) => {
                  const key = `${pillar}-${platform}`
                  const cell = matrix[key] ?? { frequency: "", status: "empty" as CellStatus }
                  return (
                    <td key={platform} className="px-1 py-1">
                      <button
                        type="button"
                        onClick={() => cycleStatus(key)}
                        className={cn(
                          "flex w-full flex-col items-center rounded-lg px-2 py-2 transition-colors",
                          STATUS_STYLES[cell.status],
                        )}
                      >
                        <span className="text-[10px] font-medium">
                          {cell.status === "empty"
                            ? "—"
                            : cell.status === "planned"
                              ? "计划中"
                              : cell.status === "active"
                                ? "进行中"
                                : "已完成"}
                        </span>
                        {cell.frequency && (
                          <span className="mt-0.5 text-[9px] opacity-70">{cell.frequency}</span>
                        )}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
