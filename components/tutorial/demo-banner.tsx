"use client"

import { Ban, Sparkles } from "lucide-react"
import { cn } from "@/lib/utils"

type Props = {
  className?: string
  compact?: boolean
}

/** 永久醒目的演示态标识 */
export function TutorialDemoBanner({ className, compact }: Props) {
  return (
    <div
      data-tutorial-id="tutorial-demo-banner"
      className={cn(
        "flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-900 dark:text-amber-100",
        compact ? "text-[12px]" : "text-[13px]",
        className,
      )}
      role="status"
    >
      <Sparkles className={cn("shrink-0 text-amber-600 dark:text-amber-400", compact ? "h-3.5 w-3.5" : "h-4 w-4")} />
      <span className="flex-1 leading-snug">
        {compact ? (
          <>演示模式 · 零算力 · 不扣积分</>
        ) : (
          <>
            <strong className="font-semibold">已保存示例（演示模式）</strong>
            {" — "}不调用 AI / 视频生成，不扣积分，也不会写入你的真实草稿与历史。
          </>
        )}
      </span>
      <Ban className={cn("shrink-0 opacity-60", compact ? "h-3.5 w-3.5" : "h-4 w-4")} aria-hidden />
    </div>
  )
}
