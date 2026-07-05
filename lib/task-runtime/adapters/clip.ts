/**
 * 图文视频 / 视频混剪 轮询适配器
 */
import {
  queryImageToVideoStatus,
  queryMashupStatus,
} from "@/lib/video/api"
import type { ClipTaskStatusResponse } from "@/lib/video/types"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

function isTerminal(status: string): boolean {
  const s = status.toLowerCase()
  return s === "success" || s === "failed" || s === "cancelled" || s === "canceled"
}

function isSuccess(status: string): boolean {
  return status.toLowerCase() === "success"
}

async function pollClip(
  task: RuntimeTask,
  query: (taskId: string) => Promise<ClipTaskStatusResponse>,
): Promise<PollOutcome> {
  try {
    const status = await query(task.taskId)
    const stageLabel = status.stage_label || status.stage || task.stageLabel
    const progress = typeof status.progress === "number" ? status.progress : task.progress

    if (isTerminal(status.status)) {
      if (isSuccess(status.status) && status.video_url) {
        return {
          type: "success",
          progress: progress || 100,
          stageLabel: stageLabel || "完成",
          result: {
            videoUrl: status.video_url,
            audioUrl: status.audio_url,
          },
        }
      }
      return {
        type: "failed",
        error: status.error || "生成失败",
        progress,
        stageLabel,
        result: { videoUrl: status.video_url || "" },
      }
    }

    return { type: "progress", progress, stageLabel }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (/404|未找到|NOT_FOUND|TASK_NOT_FOUND/i.test(msg)) {
      return { type: "not_found", error: msg }
    }
    throw err
  }
}

export const imageVideoAdapter: TaskAdapter = {
  kind: "image-video",
  pollIntervalMs: 5_000,
  writeHistory: true,
  poll: (task) => pollClip(task, queryImageToVideoStatus),
}

export const mashupAdapter: TaskAdapter = {
  kind: "mashup",
  pollIntervalMs: 5_000,
  writeHistory: true,
  poll: (task) => pollClip(task, queryMashupStatus),
}
