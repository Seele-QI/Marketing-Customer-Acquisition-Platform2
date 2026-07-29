/**
 * 数字人创作任务总超时（50 分钟）。
 * 与后端 DH_V2_TASK_TIMEOUT / DH_V2_SEGMENT_POLL_TIMEOUT 默认 3000 秒对齐。
 */
export const DH_VIDEO_TASK_TIMEOUT_MS = 50 * 60 * 1000
/** 经济版包含最长 10 分钟克隆 + 50 分钟视频轮询，并预留本地切分/拼接时间。 */
export const DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS = 65 * 60 * 1000
export const CLIP_TASK_TIMEOUT_MS = 50 * 60 * 1000
export const PROMO_VIDEO_TASK_TIMEOUT_MS = 60 * 60 * 1000
export const COPYWRITING_EXTRACT_TASK_TIMEOUT_MS = 15 * 60 * 1000

export function getTaskHardTimeoutMs(kind: string): number | null {
  switch (kind) {
    case "dh-video-economy":
      return DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS
    case "dh-video-v2":
      return DH_VIDEO_TASK_TIMEOUT_MS
    case "image-video":
    case "mashup":
      return CLIP_TASK_TIMEOUT_MS
    case "promo-video":
      return PROMO_VIDEO_TASK_TIMEOUT_MS
    case "copywriting-extract":
      return COPYWRITING_EXTRACT_TASK_TIMEOUT_MS
    default:
      return null
  }
}
