/** 宣传视频模块常量 — 负责人：宣传视频工作区 */

export const PROMO_DURATIONS = [15, 30, 45, 60] as const
export const PROMO_FRAME_COUNTS = [9, 16, 25] as const
export const PROMO_RATIOS = [
  { value: "adaptive", label: "自适应" },
  { value: "16:9", label: "16:9 横屏" },
  { value: "9:16", label: "9:16 竖屏" },
  { value: "1:1", label: "1:1 方形" },
] as const

export const PROMO_ACCEPTED_AUDIO = "audio/mp3,audio/wav,audio/m4a,audio/ogg"
export const PROMO_MAX_AUDIO_SIZE = 20 * 1024 * 1024 // 20 MB

export type PromoFrameCount = (typeof PROMO_FRAME_COUNTS)[number]

export const PROMO_STEP_LABELS = [
  { id: 1 as const, label: "上传素材" },
  { id: 2 as const, label: "分镜" },
  { id: 3 as const, label: "提示词" },
  { id: 4 as const, label: "视频" },
] as const

/** RH 分镜 AI App 2004879210508419073 — node 5 channel */
export const PROMO_RH_STORYBOARD_APP_ID = "2004879210508419073"

/** 多宫格分镜图提交时由后端自动追加到产品提示词（勿在前端拼接） */
export const PROMO_STORYBOARD_NO_LABEL_SUFFIX =
  "不要生成任何类似「分镜1」「分镜2」的文字"

/** RH 多宫格裁切 AI App 2037785424789245953 — node 19-22 */
export const PROMO_RH_CROP_APP_ID = "2037785424789245953"

/** RH node 5 channel */
export const PROMO_RH_CHANNELS = [
  { value: "Third-party", label: "第三方路线" },
  { value: "Official", label: "官方路线" },
] as const

/** RH node 5 resolution — 8k 仅 Official */
export const PROMO_RH_RESOLUTIONS = [
  { value: "1k", label: "1K" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
  { value: "8k", label: "8K（仅官方）", officialOnly: true },
] as const

/** RH node 31 select — 宫格数量 */
export const PROMO_RH_FRAME_COUNTS = [
  { value: 9, rhSelect: "1", label: "9 宫格" },
  { value: 16, rhSelect: "2", label: "16 宫格" },
  { value: 25, rhSelect: "3", label: "25 宫格" },
] as const

/** RH node 14 select — 文生图 / 图生图 */
export const PROMO_RH_IMAGE_MODES = [
  { value: "1", label: "文生图" },
  { value: "2", label: "图生图" },
] as const

/** RH instanceType */
export const PROMO_RH_INSTANCE_TYPES = [
  { value: "default", label: "默认（24G）" },
  { value: "plus", label: "Plus（48G）" },
] as const

/** RH Seedance 2.0 AI App 2037453629342355457 — node 2/7/8/9/10/11/12/13/14 image */
export const PROMO_RH_SEEDANCE_APP_ID = "2037453629342355457"

export const PROMO_SEEDANCE_IMAGE_NODES = ["2", "7", "8", "9", "10", "11", "12", "13", "14"] as const

/** RH Seedance node 1 resolution — 与分镜 2k 分离 */
export const PROMO_VIDEO_RESOLUTIONS = [
  { value: "480p", label: "480p" },
  { value: "720p", label: "720p（推荐）" },
  { value: "1080p", label: "1080p" },
  { value: "2k", label: "2K" },
  { value: "4k", label: "4K" },
] as const

export type PromoVideoResolution = (typeof PROMO_VIDEO_RESOLUTIONS)[number]["value"]

export type PromoRhChannel = (typeof PROMO_RH_CHANNELS)[number]["value"]
export type PromoRhResolution = (typeof PROMO_RH_RESOLUTIONS)[number]["value"]
export type PromoRhImageMode = (typeof PROMO_RH_IMAGE_MODES)[number]["value"]
export type PromoRhInstanceType = (typeof PROMO_RH_INSTANCE_TYPES)[number]["value"]

/** 按 channel 过滤可用分辨率 */
export function promoResolutionsForChannel(channel: PromoRhChannel) {
  return PROMO_RH_RESOLUTIONS.filter(
    (r) => !("officialOnly" in r && r.officialOnly) || channel === "Official",
  )
}

/** 成片扣费：每 15 秒 450 积分（与 lib/credit_pricing.py 一致） */
import { segmentCostForProvider } from "@/lib/credit-pricing/registry"

export function estimatePromoVideoCost(duration: number, _resolution?: string): number {
  const segments = Math.max(1, Math.floor((duration + 14) / 15))
  return segments * segmentCostForProvider("seedance")
}
