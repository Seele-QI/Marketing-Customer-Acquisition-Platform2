import { queryEconomyStatus } from "@/lib/dh-video-economy/api"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

const FAILED = new Set(["failed", "cancelled", "timeout", "expired", "insufficient_credit"])

export const dhVideoEconomyAdapter: TaskAdapter = {
  kind: "dh-video-economy",
  pollIntervalMs: 5_000,
  writeHistory: true,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    try {
      const status = await queryEconomyStatus(task.taskId)
      const normalized = status.status.toLowerCase()
      const progress = status.progress ?? task.progress
      const segmentResult = {
        audioDuration: status.audio_duration,
        segmentCount: status.segment_count,
        segmentsCompleted: status.segments_completed,
        segments: (status.segments ?? []).map((segment) => ({
          index: segment.index,
          status: segment.status,
          upstreamId: segment.upstream_id,
          videoUrl: segment.video_url,
          error: segment.error,
          retryCount: segment.retry_count,
        })),
      }
      if (normalized === "completed") {
        const videoUrl = status.video_url || status.result_url || ""
        if (!videoUrl) return { type: "failed", error: "任务完成但未返回视频地址" }
        return {
          type: "success",
          progress: 100,
          stageLabel: "生成完成",
          result: { videoUrl, resultUrl: videoUrl, ...segmentResult },
        }
      }
      if (FAILED.has(normalized)) {
        return {
          type: "failed",
          error: status.error || status.stage_label || "经济版数字人视频生成失败",
          progress,
          stageLabel: status.stage_label,
          result: segmentResult,
        }
      }
      return {
        type: "progress",
        progress: Math.max(progress, task.progress),
        stageLabel: status.stage_label || task.stageLabel,
        result: segmentResult,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/404|not found/i.test(message)) return { type: "not_found", error: message }
      if (/无法连接|网络|network|failed to fetch|fetch failed|load failed|超时|timeout/i.test(message)) {
        throw error
      }
      return { type: "failed", error: message }
    }
  },
}
