"use client"

/**
 * 视频创作工作区入口 — 与 GEO 优化工作区完全隔离。
 *
 * 职责：
 * 1. 仅挂载视频子视图（数字人口播 / 数字人视频创作新 / 图文 / 混剪 / 宣传 / 历史）
 * 2. 在视频工作区内切换时，保持数字人口播实例挂载（CSS 隐藏），避免内存态丢失
 * 3. 离开本工作区时整体卸载；任务状态由 lib/video-task-store 持久化恢复
 */

import { VideoCreationWorkflow } from "@/components/video-creation-workflow"
import { ImageVideoWorkflow } from "@/components/image-video-workflow"
import { MashupVideoWorkflow } from "@/components/mashup-video-workflow"
import PromoVideoWorkflow from "@/components/promo-video-workflow"
import DhVideoV2Workflow from "@/components/dh-video-v2-workflow"
import { VideoHistory } from "@/components/video-history"
import { VIDEO_VIEWS, type VideoView } from "@/lib/video/workspace"

type Props = {
  activeView: VideoView
  initialScript?: string
}

export function VideoWorkspace({ activeView, initialScript = "" }: Props) {
  const showDigitalHuman = activeView === VIDEO_VIEWS.DIGITAL_HUMAN

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-workspace="video">
      {/* 数字人口播：工作区内始终挂载，切到其他视频子页时隐藏 */}
      <div
        className={
          showDigitalHuman
            ? "flex min-h-0 flex-1 flex-col"
            : "hidden"
        }
        aria-hidden={!showDigitalHuman}
      >
        <VideoCreationWorkflow initialScript={initialScript} />
      </div>

      {activeView === VIDEO_VIEWS.IMAGE_VIDEO ? <ImageVideoWorkflow /> : null}
      {activeView === VIDEO_VIEWS.MASHUP ? <MashupVideoWorkflow /> : null}
      {activeView === VIDEO_VIEWS.PROMO ? <PromoVideoWorkflow /> : null}
      {activeView === VIDEO_VIEWS.DH_VIDEO_V2 ? <DhVideoV2Workflow /> : null}
      {activeView === VIDEO_VIEWS.HISTORY ? <VideoHistory /> : null}
    </div>
  )
}
