/**
 * 宣传视频轮询适配器（分镜 / 成片两阶段，由 meta.phase 区分）
 */
import {
  queryPromoStoryboardStatus,
  queryPromoVideoStatus,
} from "@/lib/promo-video/api"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

export const promoVideoAdapter: TaskAdapter = {
  kind: "promo-video",
  pollIntervalMs: 3_000,
  writeHistory: true,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    const phase = String(task.meta?.phase ?? "video")

    try {
      if (phase === "storyboard") {
        const sd = await queryPromoStoryboardStatus(task.taskId)
        const progress = sd.progress || task.progress
        const stageLabel = sd.stage_label || task.stageLabel || "分镜生成中"

        if (sd.status === "storyboard_ready") {
          const frameUrls = sd.frame_urls || []
          const expected = sd.frame_count || Number(task.meta?.frameCount) || 0
          if (frameUrls.length === 0 || (expected > 0 && frameUrls.length !== expected)) {
            return {
              type: "failed",
              error: sd.error || "分镜图裁切失败，未生成有效分镜帧",
              progress,
              stageLabel,
              result: {
                frames: frameUrls,
                rhTaskId: sd.rh_task_id,
                rhCropTaskId: sd.rh_crop_task_id,
                failedStage: sd.failed_stage || "pv_crop_download",
              },
              meta: { ...task.meta, phase: "storyboard", skipHistory: true },
            }
          }
          return {
            type: "success",
            progress: 100,
            stageLabel: "分镜就绪",
            result: {
              frames: frameUrls,
              frameCount: sd.frame_count,
              rhTaskId: sd.rh_task_id,
              rhCropTaskId: sd.rh_crop_task_id,
            },
            meta: { ...task.meta, phase: "storyboard", skipHistory: true },
          }
        }

        if (sd.status === "storyboard_failed") {
          return {
            type: "failed",
            error: sd.error || "分镜生成失败",
            progress,
            stageLabel,
            result: {
              rhTaskId: sd.rh_task_id,
              rhCropTaskId: sd.rh_crop_task_id,
              failedStage: sd.failed_stage || sd.stage,
            },
            meta: { ...task.meta, phase: "storyboard", skipHistory: true },
          }
        }

        return {
          type: "progress",
          progress,
          stageLabel,
          result: {
            rhTaskId: sd.rh_task_id,
            rhCropTaskId: sd.rh_crop_task_id,
            frameCount: sd.frame_count,
          },
          meta: { ...task.meta, phase: "storyboard", skipHistory: true },
        }
      }

      // video phase
      const vd = await queryPromoVideoStatus(task.taskId)
      const progress = vd.progress || task.progress
      const stageLabel = task.stageLabel || "视频生成中"
      // 保留并发封面写入的 result.coverUrl（勿从空的 meta.coverUrl 取值）
      const preservedCoverUrl = String(task.result?.coverUrl ?? "")

      if (vd.status === "video_completed") {
        return {
          type: "success",
          progress: 100,
          stageLabel: "完成",
          result: {
            videoUrl: vd.video_url || "",
            coverUrl: preservedCoverUrl,
            rhTaskIds: vd.rh_video_task_ids,
            segmentCount: vd.segment_count,
            segmentsCompleted: vd.segments_completed,
          },
          meta: { ...task.meta, phase: "video" },
        }
      }

      if (vd.status === "video_failed") {
        return {
          type: "failed",
          error: vd.error || "视频生成失败",
          progress,
          stageLabel,
          result: {
            rhTaskIds: vd.rh_video_task_ids,
            segmentCount: vd.segment_count,
            segmentsCompleted: vd.segments_completed,
          },
          meta: { ...task.meta, phase: "video" },
        }
      }

      return {
        type: "progress",
        progress,
        stageLabel,
        result: {
          rhTaskIds: vd.rh_video_task_ids,
          segmentCount: vd.segment_count,
          segmentsCompleted: vd.segments_completed,
        },
        meta: { ...task.meta, phase: "video" },
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/404|未找到|NOT_FOUND|TASK_NOT_FOUND/i.test(msg)) {
        return { type: "not_found", error: msg }
      }
      throw err
    }
  },
}
