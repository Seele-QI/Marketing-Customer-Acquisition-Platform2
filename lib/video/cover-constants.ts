/** RunningHub rhart-image-g-2 封面图生图参数 */

export const COVER_ASPECT_RATIOS = [
  "1:1",
  "2:3",
  "3:2",
  "4:5",
  "5:4",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
  "9:21",
  "2:1",
  "1:2",
  "3:1",
  "1:3",
] as const

export type CoverAspectRatio = (typeof COVER_ASPECT_RATIOS)[number]
export type CoverResolution = "1k" | "2k" | "4k"

export const COVER_RESOLUTIONS: CoverResolution[] = ["1k", "2k", "4k"]

export const DEFAULT_COVER_ASPECT_RATIO: CoverAspectRatio = "9:16"
export const DEFAULT_COVER_RESOLUTION: CoverResolution = "1k"

export const COVER_ASPECT_RATIO_LABELS: Record<CoverAspectRatio, string> = {
  "1:1": "1:1 方形",
  "2:3": "2:3 竖屏",
  "3:2": "3:2 横屏",
  "4:5": "4:5",
  "5:4": "5:4",
  "4:3": "4:3 横屏",
  "3:4": "3:4 竖屏",
  "16:9": "16:9 横屏",
  "9:16": "9:16 竖屏（推荐）",
  "21:9": "21:9 超宽",
  "9:21": "9:21 超长竖屏",
  "2:1": "2:1",
  "1:2": "1:2",
  "3:1": "3:1",
  "1:3": "1:3",
}

/** 根据用户文案生成封面图 prompt */
export function buildVideoCoverPrompt(script: string): string {
  const trimmed = script.trim().replace(/\s+/g, " ")
  const snippet = trimmed.slice(0, 2000)
  return `我准备拍摄一个短视频，文案如下（${snippet}），请你根据我的文案来创作一个短视频封面`
}
