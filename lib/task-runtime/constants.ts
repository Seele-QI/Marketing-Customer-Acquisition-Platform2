/**
 * 数字人创作任务总超时（50 分钟）。
 * 与后端 DH_V2_TASK_TIMEOUT / DH_V2_SEGMENT_POLL_TIMEOUT 默认 3000 秒对齐。
 */
export const DH_VIDEO_TASK_TIMEOUT_MS = 50 * 60 * 1000

/** 需应用整任务超时的任务类型 */
export const TASK_KINDS_WITH_HARD_TIMEOUT = new Set(["dh-video-v2"] as const)

export function getTaskHardTimeoutMs(kind: string): number | null {
  if (TASK_KINDS_WITH_HARD_TIMEOUT.has(kind as "dh-video-v2")) {
    return DH_VIDEO_TASK_TIMEOUT_MS
  }
  return null
}
