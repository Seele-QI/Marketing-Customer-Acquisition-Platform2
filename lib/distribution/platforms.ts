export type DistributionCapability = "video" | "geo_article"

export type DistributionPlatform = {
  platform_id: string
  platform_name: string
  supports_oauth: boolean
  supports_browser?: boolean
  status: string
  connected: boolean
  verification_status?: "verified" | "unverified" | "expired" | "disconnected"
  account_info?: { nickname?: string; platform_user_id?: string; verified_at?: number | null } | null
  capabilities: DistributionCapability[]
  release_status: string
  connection_health: string
  requires_manual_action?: boolean
}

export type DistributionPlatformBrand = {
  id: string
  name: string
  logo: string
  accent: string
  soft: string
  capabilities: DistributionCapability[]
}

export const DISTRIBUTION_PLATFORM_BRANDS: DistributionPlatformBrand[] = [
  { id: "douyin", name: "抖音", logo: "/brands/distribution/douyin.jpg", accent: "#111827", soft: "#f3f4f6", capabilities: ["video"] },
  { id: "xiaohongshu", name: "小红书", logo: "/brands/distribution/xiaohongshu.png", accent: "#ff2442", soft: "#fff1f3", capabilities: ["video", "geo_article"] },
  { id: "kuaishou", name: "快手", logo: "/brands/distribution/kuaishou.png", accent: "#ff5000", soft: "#fff3eb", capabilities: ["video"] },
  { id: "shipinhao", name: "视频号", logo: "/brands/distribution/shipinhao.ico", accent: "#07c160", soft: "#edfbf3", capabilities: ["video"] },
  { id: "zhihu", name: "知乎", logo: "", accent: "#1772f6", soft: "#edf5ff", capabilities: ["geo_article"] },
  { id: "weibo", name: "微博", logo: "", accent: "#e6162d", soft: "#fff0f1", capabilities: ["geo_article"] },
  { id: "dianping", name: "大众点评", logo: "", accent: "#ff6633", soft: "#fff3ee", capabilities: ["geo_article"] },
  { id: "ctrip", name: "携程", logo: "", accent: "#287dfa", soft: "#eef5ff", capabilities: ["geo_article"] },
  { id: "sohu", name: "搜狐", logo: "", accent: "#d71920", soft: "#fff0f0", capabilities: ["geo_article"] },
  { id: "toutiao", name: "今日头条", logo: "", accent: "#f04142", soft: "#fff1f1", capabilities: ["geo_article"] },
  { id: "baijiahao", name: "百家号", logo: "", accent: "#315efb", soft: "#eef2ff", capabilities: ["geo_article"] },
]

export const VIDEO_PLATFORM_IDS = ["douyin", "xiaohongshu", "kuaishou", "shipinhao"]
export const GEO_ARTICLE_PLATFORM_IDS = ["zhihu", "weibo", "sohu", "xiaohongshu", "dianping", "ctrip", "toutiao", "baijiahao"]

export function getDistributionPlatformBrand(platformId: string) {
  return DISTRIBUTION_PLATFORM_BRANDS.find((brand) => brand.id === platformId)
}

export function mergeDistributionPlatforms(
  fromApi: DistributionPlatform[],
  capability: DistributionCapability,
  serviceError = fromApi.length === 0,
): DistributionPlatform[] {
  const byId = new Map(fromApi.map((platform) => [platform.platform_id, platform]))
  return DISTRIBUTION_PLATFORM_BRANDS
    .filter((brand) => brand.capabilities.includes(capability))
    .map((brand) => {
      const current = byId.get(brand.id)
      return current
        ? { ...current, capabilities: current.capabilities ?? brand.capabilities }
        : {
            platform_id: brand.id,
            platform_name: brand.name,
            supports_oauth: false,
            supports_browser: true,
            status: "disconnected",
            connected: false,
            verification_status: "disconnected",
            account_info: null,
            capabilities: brand.capabilities,
            release_status: "testing",
            connection_health: serviceError ? "service_error" : "disconnected",
            requires_manual_action: true,
          }
    })
}

function apiMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  const object = value as Record<string, unknown>
  if (typeof object.error === "string" && object.error) return object.error
  if (typeof object.detail === "string" && object.detail) return object.detail
  if (object.detail && typeof object.detail === "object") {
    const message = (object.detail as Record<string, unknown>).message
    if (typeof message === "string" && message) return message
  }
  if (typeof object.message === "string" && object.message) return object.message
  return null
}

export async function readDistributionApiResponse<T = Record<string, unknown>>(
  response: Response,
  fallback: string,
): Promise<{ ok: boolean; data: T | null; message: string }> {
  const text = await response.text()
  let data: T | null = null
  if (text) {
    try {
      data = JSON.parse(text) as T
    } catch {
      data = null
    }
  }
  const parsed = apiMessage(data)
  if (response.ok) return { ok: true, data, message: parsed || "" }
  const genericServerError = response.status >= 500 && (!parsed || /internal server error/i.test(parsed))
  return {
    ok: false,
    data,
    message: genericServerError ? "账号服务暂时不可用，请稍后重试" : parsed || fallback,
  }
}

export const DISTRIBUTION_ACCOUNTS_CHANGED_EVENT = "distribution-accounts-changed"
