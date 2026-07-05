/**
 * 数字人视频创作（新）轮询适配器
 */
import { queryDhVideoV2Status } from "@/lib/dh-video-v2/api"
import type { DhV2SegmentRuntimeStatus } from "@/lib/dh-video-v2/types"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

const TERMINAL_OK = new Set(["completed", "succeeded", "success", "SUCCESS"])
const TERMINAL_FAIL = new Set(["failed", "failure", "error", "cancelled", "rejected"])
const KEEP_POLLING = new Set(["partial_failed", "concatenating", "processing", "queued", "running"])

function mapSegments(segments: DhV2SegmentRuntimeStatus[] | undefined) {
  if (!Array.isArray(segments)) return undefined
  return segments.map((s) => ({
    index: s.index,
    status: s.status,
    videoUrl: s.video_url,
    error: s.error,
    timeRange: s.time_range,
    dialogue: s.dialogue,
  }))
}

export const dhVideoV2Adapter: TaskAdapter = {
  kind: "dh-video-v2",
  pollIntervalMs: 5_000,
  writeHistory: true,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    try {
      const sd = await queryDhVideoV2Status(task.taskId)
      const status = String(sd.status ?? "").toLowerCase()
      const progress =
        typeof sd.progress === "number"
          ? sd.progress
          : /100/.test(String(sd.progress))
            ? 100
            : task.progress
      const stageLabel = sd.stage_label || task.stageLabel || "视频生成中"
      const videoUrl =
        (typeof sd.result_url === "string" && sd.result_url.startsWith("/")
          ? sd.result_url
          : "") ||
        sd.video_url ||
        sd.result_url ||
        ""

      const segmentResult = {
        segmentCount: sd.segment_count,
        segmentsCompleted: sd.segments_completed,
        segments: mapSegments(sd.segments),
      }

      if (TERMINAL_OK.has(status) || status === "completed") {
        if (!videoUrl) {
          return {
            type: "failed",
            error: sd.error || "任务完成但未返回视频地址",
            progress,
            stageLabel,
            result: segmentResult,
          }
        }
        return {
          type: "success",
          progress: 100,
          stageLabel: "生成完成",
          result: {
            videoUrl,
            resultUrl: videoUrl,
            ...segmentResult,
          },
        }
      }

      if (status === "partial_failed" || KEEP_POLLING.has(status)) {
        return {
          type: "progress",
          progress: Math.max(progress, task.progress),
          stageLabel,
          result: {
            ...(videoUrl ? { videoUrl } : {}),
            ...segmentResult,
          },
        }
      }

      if (TERMINAL_FAIL.has(status) || status === "timeout" || status === "expired") {
        return {
          type: "failed",
          error: sd.error || sd.detail || `任务失败（${sd.status}）`,
          progress,
          stageLabel,
          result: segmentResult,
        }
      }

      return {
        type: "progress",
        progress: Math.max(progress, task.progress),
        stageLabel,
        result: {
          ...(videoUrl ? { videoUrl } : {}),
          ...segmentResult,
        },
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/尚未接入|501|not_found/i.test(msg)) {
        return { type: "not_found", error: msg }
      }
      return { type: "failed", error: msg }
    }
  },
}
