"use client"

import { cn } from "@/lib/utils"

export type HookTag = {
  id: string
  label: string
  /** 用于区分药丸底色：紫系 / 黄系 */
  tone: "violet" | "amber" | "purple"
}

export type HookCardData = {
  sectionEmoji: string
  sectionTitle: string
  quote: string
  tags: HookTag[]
}

const MOCK_HOOK: HookCardData = {
  sectionEmoji: "🎣",
  sectionTitle: "黄金三秒钩子",
  quote: "你以为努力就能逆袭？错——选对赛道，比熬夜重要一万倍。",
  tags: [
    { id: "t1", label: "制造悬念", tone: "violet" },
    { id: "t2", label: "反常识", tone: "amber" },
    { id: "t3", label: "结果承诺", tone: "purple" },
  ],
}

const tagToneClass: Record<HookTag["tone"], string> = {
  violet:
    "bg-violet-200/90 text-violet-950 ring-violet-500/25 dark:bg-violet-950/88 dark:text-violet-50 dark:ring-violet-400/35",
  amber:
    "bg-amber-200/90 text-amber-950 ring-amber-400/30 dark:bg-amber-950/85 dark:text-amber-50 dark:ring-amber-300/35",
  purple:
    "bg-purple-200/90 text-purple-950 ring-purple-500/25 dark:bg-purple-950/88 dark:text-purple-50 dark:ring-purple-400/35",
}

export type HookCardProps = {
  data?: HookCardData
  className?: string
}

/**
 * 卡片 2 · 黄金三秒钩子：Emoji 小标题 + 金句气泡 + 药丸标签
 */
export function HookCard({ data = MOCK_HOOK, className }: HookCardProps) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-2xl border border-border/60 bg-card p-4 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04] sm:p-5",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <span className="mr-1.5 text-base leading-none" aria-hidden="true">
          {data.sectionEmoji}
        </span>
        {data.sectionTitle}
      </p>

      <div
        className={cn(
          "mt-3 rounded-2xl border border-border/30 bg-slate-100/90 px-4 py-3.5",
          "dark:border-border/40 dark:bg-muted/88",
        )}
      >
        <p className="text-[15px] font-bold leading-snug tracking-tight text-foreground">{data.quote}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {data.tags.map((tag) => (
          <span
            key={tag.id}
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide ring-1 ring-inset",
              tagToneClass[tag.tone],
            )}
          >
            {tag.label}
          </span>
        ))}
      </div>
    </article>
  )
}
