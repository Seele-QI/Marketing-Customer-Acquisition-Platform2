"use client"

import { Music, Captions, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  enableBgm: boolean
  enableSubtitles: boolean
  onEnableBgmChange: (v: boolean) => void
  onEnableSubtitlesChange: (v: boolean) => void
  className?: string
  /** 强调色：数字人口播 rose，图文 emerald，混剪 violet */
  accent?: "rose" | "emerald" | "violet"
  /** horizontal：两列并排；vertical：竖向堆叠 */
  layout?: "horizontal" | "vertical"
}

const ACCENT_STYLES = {
  rose: {
    border:
      "border-rose-400 bg-rose-50/80 ring-2 ring-rose-500/20 dark:border-rose-500/50 dark:bg-rose-500/10",
    icon: "bg-rose-500 text-white",
    check: "text-rose-500",
  },
  emerald: {
    border:
      "border-emerald-400 bg-emerald-50/80 ring-2 ring-emerald-500/20 dark:border-emerald-500/50 dark:bg-emerald-500/10",
    icon: "bg-emerald-500 text-white",
    check: "text-emerald-500",
  },
  violet: {
    border:
      "border-violet-400 bg-violet-50/80 ring-2 ring-violet-500/20 dark:border-violet-500/50 dark:bg-violet-500/10",
    icon: "bg-violet-500 text-white",
    check: "text-violet-500",
  },
} as const

export function VideoClipOptions({
  enableBgm,
  enableSubtitles,
  onEnableBgmChange,
  onEnableSubtitlesChange,
  className,
  accent = "rose",
  layout = "horizontal",
}: Props) {
  const { border: onBorder, icon: onIcon, check: onCheck } = ACCENT_STYLES[accent]
  const compact = layout === "vertical"

  return (
    <div
      className={cn(
        "grid gap-3",
        layout === "vertical" ? "grid-cols-1" : "sm:grid-cols-2",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onEnableBgmChange(!enableBgm)}
        aria-pressed={enableBgm}
        className={cn(
          "flex items-start gap-3 rounded-2xl border-2 text-left transition-all",
          compact ? "p-3" : "p-4",
          enableBgm
            ? onBorder
            : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-xl",
            compact ? "h-9 w-9" : "h-10 w-10",
            enableBgm ? onIcon : "bg-slate-100 text-slate-400 dark:bg-white/10",
          )}
        >
          <Music className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "font-bold text-slate-800 dark:text-slate-100",
                compact ? "text-[13px]" : "text-[15px]",
              )}
            >
              自动添加 BGM
            </span>
            {enableBgm ? <CheckCircle2 className={cn("h-4 w-4", onCheck)} /> : null}
          </span>
          <span
            className={cn(
              "mt-1 block leading-relaxed text-slate-500 dark:text-slate-400",
              compact ? "text-[11px]" : "text-[12px]",
            )}
          >
            勾选后，自动剪辑时混入背景音乐；关闭则仅保留人声
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onEnableSubtitlesChange(!enableSubtitles)}
        aria-pressed={enableSubtitles}
        className={cn(
          "flex items-start gap-3 rounded-2xl border-2 text-left transition-all",
          compact ? "p-3" : "p-4",
          enableSubtitles
            ? onBorder
            : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-white/10 dark:bg-white/5",
        )}
      >
        <span
          className={cn(
            "mt-0.5 flex shrink-0 items-center justify-center rounded-xl",
            compact ? "h-9 w-9" : "h-10 w-10",
            enableSubtitles ? onIcon : "bg-slate-100 text-slate-400 dark:bg-white/10",
          )}
        >
          <Captions className={cn(compact ? "h-4 w-4" : "h-5 w-5")} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "font-bold text-slate-800 dark:text-slate-100",
                compact ? "text-[13px]" : "text-[15px]",
              )}
            >
              自动添加字幕
            </span>
            {enableSubtitles ? (
              <CheckCircle2 className={cn("h-4 w-4", onCheck)} />
            ) : null}
          </span>
          <span
            className={cn(
              "mt-1 block leading-relaxed text-slate-500 dark:text-slate-400",
              compact ? "text-[11px]" : "text-[12px]",
            )}
          >
            勾选后，ASR 对齐校对并烧录字幕；关闭则输出无字幕视频
          </span>
        </span>
      </button>
    </div>
  )
}
