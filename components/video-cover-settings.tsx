"use client"

import {
  COVER_ASPECT_RATIOS,
  COVER_ASPECT_RATIO_LABELS,
  COVER_RESOLUTIONS,
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import { cn } from "@/lib/utils"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { WorkflowAccent } from "@/components/video-workflow-shell"

type Props = {
  aspectRatio: CoverAspectRatio
  resolution: CoverResolution
  onAspectRatioChange: (v: CoverAspectRatio) => void
  onResolutionChange: (v: CoverResolution) => void
  className?: string
  accent?: WorkflowAccent
}

const ACCENT_TITLE: Record<WorkflowAccent, string> = {
  rose: "text-rose-600 dark:text-rose-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  violet: "text-violet-600 dark:text-violet-400",
  sky: "text-sky-600 dark:text-sky-400",
  amber: "text-amber-600 dark:text-amber-400",
}

export function VideoCoverSettings({
  aspectRatio,
  resolution,
  onAspectRatioChange,
  onResolutionChange,
  className,
  accent = "rose",
}: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/60 bg-white p-4 dark:border-white/10 dark:bg-white/5",
        className,
      )}
    >
      <p className={cn("text-[13px] font-medium", ACCENT_TITLE[accent])}>短视频封面（并行生成）</p>
      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        与视频生成同时进行，失败不影响主任务；根据文案与参考图生成封面。
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[11px] text-slate-500">封面比例</label>
          <Select value={aspectRatio} onValueChange={(v) => onAspectRatioChange(v as CoverAspectRatio)}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue placeholder={DEFAULT_COVER_ASPECT_RATIO} />
            </SelectTrigger>
            <SelectContent>
              {COVER_ASPECT_RATIOS.map((r) => (
                <SelectItem key={r} value={r} className="text-[12px]">
                  {COVER_ASPECT_RATIO_LABELS[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] text-slate-500">分辨率</label>
          <Select value={resolution} onValueChange={(v) => onResolutionChange(v as CoverResolution)}>
            <SelectTrigger className="h-9 text-[12px]">
              <SelectValue placeholder={DEFAULT_COVER_RESOLUTION} />
            </SelectTrigger>
            <SelectContent>
              {COVER_RESOLUTIONS.map((r) => (
                <SelectItem key={r} value={r} className="text-[12px]">
                  {r.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  )
}
