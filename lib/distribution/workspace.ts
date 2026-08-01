export const DISTRIBUTION_VIEWS = {
  VIDEO: "视频一键分发",
  GEO_ARTICLE: "GEO文章一键分发",
} as const

export type DistributionView = (typeof DISTRIBUTION_VIEWS)[keyof typeof DISTRIBUTION_VIEWS]

const DISTRIBUTION_VIEW_SET = new Set<string>(Object.values(DISTRIBUTION_VIEWS))

export function isDistributionView(view: string): view is DistributionView {
  return DISTRIBUTION_VIEW_SET.has(view)
}

export function getDistributionBreadcrumb(view: DistributionView): {
  parent: string
  current: string
} {
  return { parent: "一键分发", current: view }
}

