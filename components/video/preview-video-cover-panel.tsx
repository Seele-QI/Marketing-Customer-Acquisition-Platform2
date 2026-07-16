"use client"

/**
 * 成片预览 + 短视频封面并排展示（宣传视频 / 数字人口播新 等复用）
 */

import type { ReactNode } from "react"
import { AlertCircle, Download, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { resolveMediaUrl } from "@/lib/video/utils"

export type PreviewCoverStatus = "idle" | "running" | "success" | "failed"

export type PreviewVideoCoverPanelProps = {
  videoUrl: string
  coverUrl: string
  coverStatus: PreviewCoverStatus
  coverError?: string
  /** 成片为空时的占位文案 */
  videoEmptyHint?: string
  /** 外层 grid / 媒体框额外 class（主题色边框等） */
  borderClassName?: string
  mutedClassName?: string
  spinnerClassName?: string
  /** 下载视频 / 下载封面 / 其它操作按钮 */
  actions?: ReactNode
  /** 是否在面板内渲染默认下载按钮（无自定义 actions 时使用） */
  showDefaultDownloads?: boolean
  onCreateNew?: () => void
  createNewLabel?: string
  downloadVideoClassName?: string
  downloadCoverClassName?: string
  createNewClassName?: string
}

export function PreviewVideoCoverPanel({
  videoUrl,
  coverUrl,
  coverStatus,
  coverError = "",
  videoEmptyHint = "等待 video_url",
  borderClassName = "border-slate-200/60 dark:border-white/10",
  mutedClassName = "text-slate-500",
  spinnerClassName = "text-sky-400",
  actions,
  showDefaultDownloads = true,
  onCreateNew,
  createNewLabel = "创建新视频",
  downloadVideoClassName = "rounded-full bg-sky-500 hover:bg-sky-600",
  downloadCoverClassName = "rounded-full",
  createNewClassName = "rounded-full",
}: PreviewVideoCoverPanelProps) {
  const resolvedVideo = videoUrl ? resolveMediaUrl(videoUrl) : ""
  const resolvedCover = coverUrl ? resolveMediaUrl(coverUrl) : ""

  const defaultActions =
    showDefaultDownloads && !actions ? (
      <div className="mt-5 flex flex-wrap justify-center gap-3">
        {onCreateNew ? (
          <Button variant="outline" onClick={onCreateNew} className={createNewClassName}>
            {createNewLabel}
          </Button>
        ) : null}
        {resolvedVideo ? (
          <Button asChild className={downloadVideoClassName}>
            <a href={resolvedVideo} download target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              下载视频
            </a>
          </Button>
        ) : null}
        {resolvedCover ? (
          <Button asChild variant="outline" className={downloadCoverClassName}>
            <a href={resolvedCover} download target="_blank" rel="noreferrer">
              <Download className="mr-2 h-4 w-4" />
              下载封面
            </a>
          </Button>
        ) : null}
      </div>
    ) : (
      actions
    )

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div>
          <p className={cn("mb-2 text-[11px] font-medium", mutedClassName)}>成片预览</p>
          {resolvedVideo ? (
            <video
              src={resolvedVideo}
              controls
              disablePictureInPicture
              className={cn(
                "mx-auto max-h-[480px] w-full max-w-md rounded-xl border bg-black",
                borderClassName,
              )}
            />
          ) : (
            <div
              className={cn(
                "mx-auto flex aspect-[9/16] max-h-[400px] w-full max-w-xs items-center justify-center rounded-xl border border-dashed",
                borderClassName,
              )}
            >
              <p className={cn("px-4 text-center text-[12px]", mutedClassName)}>{videoEmptyHint}</p>
            </div>
          )}
        </div>
        <div>
          <p className={cn("mb-2 text-[11px] font-medium", mutedClassName)}>短视频封面</p>
          {resolvedCover ? (
            <img
              src={resolvedCover}
              alt="短视频封面"
              className={cn(
                "mx-auto max-h-[480px] w-full max-w-md rounded-xl border object-contain",
                borderClassName,
              )}
            />
          ) : (
            <div
              className={cn(
                "mx-auto flex aspect-[9/16] max-h-[400px] w-full max-w-xs flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4",
                borderClassName,
              )}
            >
              {coverStatus === "running" ? (
                <>
                  <Loader2 className={cn("h-8 w-8 animate-spin", spinnerClassName)} />
                  <p className={cn("text-center text-[12px]", mutedClassName)}>封面生成中…</p>
                </>
              ) : coverStatus === "failed" ? (
                <>
                  <AlertCircle className="h-7 w-7 text-amber-500" />
                  <p className={cn("text-center text-[12px]", mutedClassName)}>
                    {coverError || "封面生成失败，不影响视频下载"}
                  </p>
                </>
              ) : (
                <p className={cn("text-center text-[12px]", mutedClassName)}>未生成封面</p>
              )}
            </div>
          )}
        </div>
      </div>
      {defaultActions}
    </div>
  )
}
