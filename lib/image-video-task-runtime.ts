import type { ClipTaskStatusResponse } from "@/lib/video/types"
import { POLL_ERROR_LIMIT, TASK_TIMEOUT_MS } from "@/lib/video/clip-task-constants"

export const CLIP_POLL_INTERVAL_MS = 5_000
export { POLL_ERROR_LIMIT, TASK_TIMEOUT_MS }

const IV_DECODE_STAGES = new Set(["iv_decoding_images", "iv_decoding_audio"])
const IV_AUDIO_STAGES = new Set([
  "iv_uploading_audio",
  "iv_submitting_clone",
  "iv_waiting_clone",
  "iv_downloading_clone",
])

const MV_DECODE_STAGES = new Set(["mv_decoding_videos", "mv_decoding_audio"])
const MV_AUDIO_STAGES = new Set([
  "mv_uploading_audio",
  "mv_submitting_clone",
  "mv_waiting_clone",
  "mv_downloading_clone",
])

export function ivStageToStep(stage: string, status: string): 1 | 2 | 3 {
  if (status === "queued" && IV_DECODE_STAGES.has(stage)) return 2
  if (IV_DECODE_STAGES.has(stage)) return 1
  if (IV_AUDIO_STAGES.has(stage)) return 2
  return 3
}

export function mvStageToStep(stage: string, status: string): 1 | 2 | 3 {
  if (status === "queued" && MV_DECODE_STAGES.has(stage)) return 2
  if (MV_DECODE_STAGES.has(stage)) return 1
  if (MV_AUDIO_STAGES.has(stage)) return 2
  return 3
}

export function formatClipNetworkError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? "")
  if (msg === "Failed to fetch" || /NetworkError|fetch failed/i.test(msg)) {
    return "网络连接中断，请检查后端服务是否在运行"
  }
  return msg || "网络或服务错误"
}

export function isClipTerminal(status: ClipTaskStatusResponse): boolean {
  const stage = status.stage || ""
  return (
    status.status === "completed" ||
    status.status === "failed" ||
    status.status === "cancelled" ||
    stage.endsWith("_completed") ||
    stage.endsWith("_failed") ||
    stage.endsWith("_cancelled")
  )
}

export function isClipSuccess(status: ClipTaskStatusResponse): boolean {
  return status.status === "completed" || status.stage?.endsWith("_completed") === true
}
