/**
 * 数字人口播 — 剪辑子任务轮询（/api/video/edit/status）
 */
import type { PollOutcome, RuntimeTask } from "@/lib/task-runtime/types"

const VIDEO_FETCH: RequestInit = { credentials: "include" as RequestCredentials }

type EditStatusResponse = {
  status?: string
  progress?: number
  output_video_url?: string
  error?: string
}

export async function pollDigitalHumanEditJob(task: RuntimeTask): Promise<PollOutcome> {
  const editJobId = String(task.meta?.editJobId ?? "")
  if (!editJobId) {
    return { type: "failed", error: "缺少剪辑任务 ID" }
  }

  const res = await fetch(
    `/api/video/edit/status?editJobId=${encodeURIComponent(editJobId)}`,
    VIDEO_FETCH,
  )
  const data = (await res.json()) as EditStatusResponse & { detail?: unknown }

  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : data.error || "查询剪辑状态失败"
    return { type: "failed", error: detail, stageLabel: "剪辑失败" }
  }

  const progress = typeof data.progress === "number" ? data.progress : task.progress

  if (data.status === "success" && data.output_video_url) {
    return {
      type: "success",
      progress: 100,
      stageLabel: "剪辑完成",
      result: {
        videoUrl: data.output_video_url,
        postStage: "published",
        postProgress: 100,
      },
      meta: { ...task.meta, phase: "done" },
    }
  }

  if (data.status === "failed") {
    return {
      type: "failed",
      error: data.error || "剪辑失败，请重试",
      stageLabel: "剪辑失败",
      meta: { ...task.meta, phase: "edit_failed" },
    }
  }

  return {
    type: "progress",
    progress: Math.max(progress, 30),
    stageLabel: "剪辑中",
    result: {
      postStage: data.status || "running",
      postProgress: progress,
    },
    meta: { ...task.meta, phase: "editing" },
  }
}
