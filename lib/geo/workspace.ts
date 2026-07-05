/**
 * GEO 优化工作区契约（与视频创作工作区隔离）
 *
 * - 侧边栏分组、面包屑、路由判定统一从此处读取
 * - 禁止在视频 / 文案等模块硬编码 GEO view key
 */

export const GEO_WORKSPACE_ID = "geo" as const
export const GEO_WORKSPACE_LABEL = "GEO优化"

export const GEO_VIEWS = {
  KNOWLEDGE_BASE: "企业知识库搭建",
  CONTENT_MATRIX: "内容矩阵规划",
  ARTICLE_EDITOR: "深度优化文章创作",
  MULTI_PLATFORM_PUSH: "多平台一键推送",
} as const

export type GeoView = (typeof GEO_VIEWS)[keyof typeof GEO_VIEWS]

export const GEO_VIEW_LABELS: Record<GeoView, string> = {
  [GEO_VIEWS.KNOWLEDGE_BASE]: "企业知识库搭建",
  [GEO_VIEWS.CONTENT_MATRIX]: "内容矩阵规划",
  [GEO_VIEWS.ARTICLE_EDITOR]: "深度优化文章创作",
  [GEO_VIEWS.MULTI_PLATFORM_PUSH]: "多平台一键推送",
}

const GEO_VIEW_SET = new Set<string>(Object.values(GEO_VIEWS))

export function isGeoView(view: string): view is GeoView {
  return GEO_VIEW_SET.has(view)
}

export function getGeoBreadcrumb(view: GeoView): {
  parent: string
  current: string
} {
  return {
    parent: GEO_WORKSPACE_LABEL,
    current: GEO_VIEW_LABELS[view],
  }
}
