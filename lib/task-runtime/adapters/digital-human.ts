/**
 * 数字人口播状态轮询适配器
 * 覆盖主生成管线（含封面等待 / 后处理）及剪辑子任务（meta.phase=editing）。
 */
import { queryVideoStatus } from "@/lib/video/api"
import { pollDigitalHumanEditJob } from "@/lib/task-runtime/adapters/digital-human-edit"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

/** 封面等待上限（与 workflow 一致） */
const COVER_WAIT_MS = 120_000

type DhMeta = {
  coverWaitStartedAt?: number
  historyWritten?: boolean
}

function readMeta(task: RuntimeTask): DhMeta {
  return (task.meta ?? {}) as DhMeta
}

export const digitalHumanAdapter: TaskAdapter = {
  kind: "digital-human",
  pollIntervalMs: 5_000,
  writeHistory: true,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    if (task.meta?.phase === "editing") {
      return pollDigitalHumanEditJob(task)
    }

    let sd: Record<string, unknown>
    try {
      sd = (await queryVideoStatus(task.taskId)) as unknown as Record<string, unknown>
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/404|未找到|NOT_FOUND|TASK_NOT_FOUND/i.test(msg)) {
        return { type: "not_found", error: msg }
      }
      throw err
    }

    const status = String(sd.status ?? "").toLowerCase()
    const progress = typeof sd.progress === "number" ? sd.progress : task.progress
    const stageLabel =
      typeof sd.stage_label === "string"
        ? sd.stage_label
        : typeof sd.stageLabel === "string"
          ? sd.stageLabel
          : typeof sd.stage === "string"
            ? sd.stage
            : task.stageLabel

    const videoUrl = String(sd.video_url ?? sd.videoUrl ?? "")
    const coverUrl = String(sd.cover_url ?? sd.coverUrl ?? "")
    const postUrl = String(sd.post_video_url ?? sd.postVideoUrl ?? "")
    const postStage = String(sd.post_stage ?? sd.postStage ?? "").toLowerCase()
    const postProgress =
      typeof sd.post_progress === "number"
        ? sd.post_progress
        : typeof sd.postProgress === "number"
          ? sd.postProgress
          : 0
    const coverStatus = String(sd.cover_status ?? sd.coverStatus ?? "").toLowerCase()
    const coverError = String(sd.cover_error ?? sd.coverError ?? "")
    const segmentCount =
      typeof sd.segment_count === "number"
        ? sd.segment_count
        : typeof sd.segmentCount === "number"
          ? sd.segmentCount
          : undefined
    const segmentsCompleted =
      typeof sd.segments_completed === "number"
        ? sd.segments_completed
        : typeof sd.segmentsCompleted === "number"
          ? sd.segmentsCompleted
          : undefined

    const baseResult = {
      videoUrl: postUrl || videoUrl,
      coverUrl,
      coverStatus,
      coverError,
      postStage,
      postProgress,
      segmentCount,
      segmentsCompleted,
      rawStatus: status,
    }

    if (status === "failed" || status === "cancelled" || status === "canceled") {
      return {
        type: "failed",
        error: String(sd.error ?? sd.detail ?? "生成失败"),
        progress,
        stageLabel: stageLabel || "失败",
        result: baseResult,
      }
    }

    const awaitingPost = postStage === "running" || status === "post_processing"
    if (awaitingPost) {
      return {
        type: "progress",
        progress: Math.max(progress, 90),
        stageLabel: stageLabel || "后处理中",
        result: { ...baseResult, videoUrl },
        meta: { ...task.meta, coverWaitStartedAt: 0 },
      }
    }

    if (status === "post_failed") {
      // 半成品视频仍可用，记为成功（与现网 workflow 一致：不 fail 整单）
      if (videoUrl) {
        return {
          type: "success",
          progress: 100,
          stageLabel: "完成（后处理失败）",
          result: { ...baseResult, videoUrl },
        }
      }
      return {
        type: "failed",
        error: String(sd.post_error ?? sd.postError ?? "后处理失败"),
        progress,
        stageLabel: stageLabel || "后处理失败",
        result: baseResult,
      }
    }

    const terminalOk =
      status === "success" || status === "published" || postStage === "published"

    if (terminalOk && (postUrl || videoUrl)) {
      const finalUrl = postUrl || videoUrl

      // 有封面或封面已失败 → 完成
      if (coverUrl || coverStatus === "failed" || postStage === "published" || status === "published") {
        return {
          type: "success",
          progress: 100,
          stageLabel: stageLabel || "完成",
          result: { ...baseResult, videoUrl: finalUrl, coverUrl },
        }
      }

      // 等封面，超时则完成
      const meta = readMeta(task)
      const waitStart = meta.coverWaitStartedAt || Date.now()
      if (Date.now() - waitStart > COVER_WAIT_MS) {
        return {
          type: "success",
          progress: 100,
          stageLabel: "完成（封面超时）",
          result: {
            ...baseResult,
            videoUrl: finalUrl,
            coverUrl: "",
            coverStatus: "failed",
            coverError: coverError || "封面生成超时，请稍后重试。",
          },
        }
      }

      // 半成品先写历史一次：通过 progress 事件带 historyWritten 标记由 runtime 处理
      // 这里继续 progress，但 result 已有 videoUrl，runtime 在 digital-human 特殊路径写半成品历史
      return {
        type: "progress",
        progress: 100,
        stageLabel: stageLabel || "生成封面中",
        result: { ...baseResult, videoUrl: finalUrl, coverStatus: "running" },
        meta: {
          ...task.meta,
          coverWaitStartedAt: waitStart,
          semiFinishedReady: true,
        },
      }
    }

    return {
      type: "progress",
      progress,
      stageLabel: stageLabel || "生成中",
      result: baseResult,
      meta: { ...task.meta, coverWaitStartedAt: 0 },
    }
  },
}
