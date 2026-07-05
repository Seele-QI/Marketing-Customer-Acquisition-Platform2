"use client"

/**
 * 视频创作工作区入口 — 与 GEO 优化工作区完全隔离。
 *
 * 职责：
 * 1. 仅挂载视频子视图（数字人口播 / 数字人视频创作新 / 图文 / 混剪 / 宣传 / 历史）
 * 2. 工作区内所有子页始终挂载（CSS 隐藏），避免切子页时内存态丢失
 * 3. 离开本工作区时整体卸载；任务状态由 draft-store / task-store / runtime 恢复
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

function panelClass(visible: boolean): string {
  return visible
    ? "flex min-h-0 flex-1 flex-col"
    : "hidden"
}

export function VideoWorkspace({ activeView, initialScript = "" }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-workspace="video">
      <div
        className={panelClass(activeView === VIDEO_VIEWS.DIGITAL_HUMAN)}
        aria-hidden={activeView !== VIDEO_VIEWS.DIGITAL_HUMAN}
      >
        <VideoCreationWorkflow initialScript={initialScript} />
      </div>

      <div
        className={panelClass(activeView === VIDEO_VIEWS.IMAGE_VIDEO)}
        aria-hidden={activeView !== VIDEO_VIEWS.IMAGE_VIDEO}
      >
        <ImageVideoWorkflow />
      </div>

      <div
        className={panelClass(activeView === VIDEO_VIEWS.MASHUP)}
        aria-hidden={activeView !== VIDEO_VIEWS.MASHUP}
      >
        <MashupVideoWorkflow />
      </div>

      <div
        className={panelClass(activeView === VIDEO_VIEWS.PROMO)}
        aria-hidden={activeView !== VIDEO_VIEWS.PROMO}
      >
        <PromoVideoWorkflow />
      </div>

      <div
        className={panelClass(activeView === VIDEO_VIEWS.DH_VIDEO_V2)}
        aria-hidden={activeView !== VIDEO_VIEWS.DH_VIDEO_V2}
      >
        <DhVideoV2Workflow />
      </div>

      <div
        className={panelClass(activeView === VIDEO_VIEWS.HISTORY)}
        aria-hidden={activeView !== VIDEO_VIEWS.HISTORY}
      >
        <VideoHistory />
      </div>
    </div>
  )
}
