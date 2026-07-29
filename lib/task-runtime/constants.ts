/**
 * 数字人创作任务总超时（50 分钟）。
 * 与后端 DH_V2_TASK_TIMEOUT / DH_V2_SEGMENT_POLL_TIMEOUT 默认 3000 秒对齐。
 */
export const DH_VIDEO_TASK_TIMEOUT_MS = 50 * 60 * 1000
/** 经济版包含最长 10 分钟克隆 + 50 分钟视频轮询，并预留本地切分/拼接时间。 */
export const DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS = 65 * 60 * 1000

/** 需应用整任务超时的任务类型 */
export const TASK_KINDS_WITH_HARD_TIMEOUT = new Set(["dh-video-v2", "dh-video-economy"] as const)

export function getTaskHardTimeoutMs(kind: string): number | null {
  if (kind === "dh-video-economy") {
    return DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS
  }
  if (TASK_KINDS_WITH_HARD_TIMEOUT.has(kind as "dh-video-v2" | "dh-video-economy")) {
    return DH_VIDEO_TASK_TIMEOUT_MS
  }
  return null
}
