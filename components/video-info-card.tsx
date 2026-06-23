"use client"

import { ImageIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export type VideoInfoCardData = {
  /** 封面占位上的说明（可选） */
  coverLabel?: string
  bloggerName: string
  publishedAt: string
  estimatedPlays: string
  likes: string
}

const MOCK_VIDEO_INFO: VideoInfoCardData = {
  coverLabel: "竖版 9:16",
  bloggerName: "小鹿内容研究所",
  publishedAt: "2026-05-02 18:40",
  estimatedPlays: "128.6 万",
  likes: "9.2 万",
}

export type VideoInfoCardProps = {
  data?: VideoInfoCardData
  className?: string
}

/**
 * 卡片 1 · 视频信息：封面占位 + 博主区 + 预估播放 / 点赞（弱对比层级）
 */
export function VideoInfoCard({ data = MOCK_VIDEO_INFO, className }: VideoInfoCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-card shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]",
        className,
      )}
    >
      {/* 封面占位 */}
      <div className="p-3 pb-0">
        <div
          className={cn(
            "relative flex aspect-video w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl",
            "bg-gradient-to-br from-slate-100 via-slate-50 to-violet-50/60",
            "dark:from-muted/80 dark:via-muted/50 dark:to-violet-950/30",
            "border border-border/40",
          )}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/80 text-muted-foreground shadow-sm ring-1 ring-border/50 dark:bg-card/80">
            <ImageIcon className="h-7 w-7" strokeWidth={1.25} aria-hidden="true" />
          </div>
          {data.coverLabel ? (
            <span className="rounded-full bg-white/70 px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground backdrop-blur dark:bg-card/70">
              {data.coverLabel}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4 pt-3">
        {/* 博主行 */}
        <div className="flex items-start gap-3">
          <div
            className="h-10 w-10 shrink-0 rounded-full bg-gradient-to-br from-violet-200/80 to-slate-200/90 ring-2 ring-white dark:from-violet-900/50 dark:to-muted dark:ring-card"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1 pt-0.5">
            <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">{data.bloggerName}</p>
            <p className="mt-0.5 text-[11px] leading-none text-muted-foreground">{data.publishedAt}</p>
          </div>
        </div>

        {/* 数据：小字、偏灰、与主信息拉开层级 */}
        <div className="flex gap-8 border-t border-border/50 pt-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">预估播放</p>
            <p className="mt-1 text-xs font-semibold tabular-nums tracking-tight text-muted-foreground">{data.estimatedPlays}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/90">点赞</p>
            <p className="mt-1 text-xs font-semibold tabular-nums tracking-tight text-muted-foreground">{data.likes}</p>
          </div>
        </div>
      </div>
    </article>
  )
}
