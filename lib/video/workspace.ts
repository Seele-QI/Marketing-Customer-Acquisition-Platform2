/**
 * 视频创作工作区契约（与 GEO 优化工作区隔离）
 *
 * - 侧边栏分组、面包屑、路由判定统一从此处读取
 * - 禁止在 GEO / 文案等模块硬编码视频 view key
 */

export const VIDEO_WORKSPACE_ID = "video" as const
export const VIDEO_WORKSPACE_LABEL = "视频创作"

/** 内部 view key → 侧边栏展示名 */
export const VIDEO_VIEWS = {
  DH_VIDEO_V2: "数字人视频创作（新）",
  DH_VIDEO_ECONOMY: "数字人视频创作（经济版）",
  IMAGE_VIDEO: "图文视频",
  MASHUP: "视频混剪",
  PROMO: "宣传视频",
  HISTORY: "历史记录",
} as const

export type VideoView = (typeof VIDEO_VIEWS)[keyof typeof VIDEO_VIEWS]

export const VIDEO_VIEW_LABELS: Record<VideoView, string> = {
  [VIDEO_VIEWS.DH_VIDEO_V2]: "数字人口播视频（新）",
  [VIDEO_VIEWS.DH_VIDEO_ECONOMY]: "数字人视频创作（经济版）",
  [VIDEO_VIEWS.IMAGE_VIDEO]: "图文视频",
  [VIDEO_VIEWS.MASHUP]: "视频混剪",
  [VIDEO_VIEWS.PROMO]: "宣传视频",
  [VIDEO_VIEWS.HISTORY]: "历史记录",
}

const VIDEO_VIEW_SET = new Set<string>(Object.values(VIDEO_VIEWS))

export function isVideoView(view: string): view is VideoView {
  return VIDEO_VIEW_SET.has(view)
}

export function getVideoBreadcrumb(view: VideoView): {
  parent: string
  current: string
} {
  return {
    parent: VIDEO_WORKSPACE_LABEL,
    current: VIDEO_VIEW_LABELS[view],
  }
}

/** 文案 / 提取跳转视频创作时的默认子页 */
export const DEFAULT_VIDEO_VIEW: VideoView = VIDEO_VIEWS.DH_VIDEO_V2
