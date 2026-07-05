"use client"

import { Loader2, RefreshCw, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { resolveMediaUrl } from "@/lib/video/utils"
import type { DhV2ThemeTokens } from "@/lib/dh-video-v2/theme"
import {
  buildSegmentStripFromPlan,
  type SegmentStripItem,
} from "@/lib/dh-video-v2/segment-strip-utils"

export type { SegmentStripItem }
export { buildSegmentStripFromPlan }

type SegmentStripProps = {
  segments: SegmentStripItem[]
  tokens: DhV2ThemeTokens
  onRetry?: (index: number) => void
  retryingIndex?: number | null
  readOnly?: boolean
}

const STATUS_LABEL: Record<SegmentStripItem["status"], string> = {
  pending: "等待中",
  submitting: "提交中",
  processing: "生成中",
  completed: "已完成",
  failed: "失败",
  timeout: "超时",
}

function statusColor(status: SegmentStripItem["status"]): string {
  if (status === "completed") return "text-emerald-500"
  if (status === "failed" || status === "timeout") return "text-red-400"
  if (status === "processing" || status === "submitting") return "text-sky-400"
  return "text-muted-foreground"
}

export function SegmentStrip({
  segments,
  tokens,
  onRetry,
  retryingIndex = null,
  readOnly = false,
}: SegmentStripProps) {
  if (!segments.length) return null

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex min-w-min gap-3">
        {segments.map((seg) => {
          const canRetry =
            !readOnly &&
            onRetry &&
            (seg.status === "failed" || seg.status === "timeout")
          const isRetrying = retryingIndex === seg.index
          const label = STATUS_LABEL[seg.status] || seg.status

          return (
            <div
              key={seg.index}
              className={cn(
                "flex w-[148px] shrink-0 flex-col rounded-xl border p-2",
                tokens.cardBorder,
                tokens.card,
              )}
            >
              <div className="mb-1.5 flex items-center justify-between gap-1">
                <span className={cn("text-[10px] font-medium", tokens.muted)}>
                  段 {seg.index + 1}
                </span>
                <span className={cn("text-[10px]", statusColor(seg.status))}>{label}</span>
              </div>

              <div
                className={cn(
                  "relative mb-2 flex aspect-[9/16] w-full items-center justify-center overflow-hidden rounded-lg border",
                  tokens.cardBorder,
                  "bg-black/5 dark:bg-white/5",
                )}
              >
                {seg.status === "completed" && seg.videoUrl ? (
                  <video
                    src={resolveMediaUrl(seg.videoUrl)}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                    controls
                  />
                ) : seg.status === "processing" || seg.status === "submitting" ? (
                  <Loader2 className={cn("h-6 w-6 animate-spin", tokens.slotIcon)} />
                ) : seg.status === "failed" || seg.status === "timeout" ? (
                  <XCircle className="h-6 w-6 text-red-400/80" />
                ) : (
                  <span className={cn("text-[10px]", tokens.muted)}>待生成</span>
                )}
              </div>

              {seg.timeRange ? (
                <p className={cn("mb-1 truncate text-[9px]", tokens.muted)}>{seg.timeRange}</p>
              ) : null}

              {seg.error && (seg.status === "failed" || seg.status === "timeout") ? (
                <p className="mb-1.5 line-clamp-2 text-[9px] text-red-300/90">{seg.error}</p>
              ) : null}

              {canRetry ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isRetrying}
                  onClick={() => onRetry(seg.index)}
                  className={cn("h-7 w-full text-[10px]", tokens.btnOutline)}
                >
                  {isRetrying ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-1 h-3 w-3" />
                  )}
                  重试本段
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
