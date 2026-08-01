/**
 * 教程演示模式守卫 — 阻断真实算力 / 扣费调用
 *
 * 设计原则：
 * - 不依赖全局 env 开关（避免误开生产）
 * - 由 TutorialProvider 在内存中置位 isDemoMode
 * - 业务入口在提交前调用 assertNotDemoMode / guardDemoAction
 */

let demoModeActive = false
let demoScenarioId: string | null = null

/** 业务 storage key 黑名单 — 教程不得写入这些 key */
export const BUSINESS_STORAGE_KEYS = [
  "agenthub-workflow-drafts",
  "agenthub-runtime-tasks",
  "video-history",
  "ip-positioning-session-v1",
  "geo-enterprise-skills-v1",
  "geo-article-batch-v1",
] as const

export function setTutorialDemoMode(active: boolean, scenarioId: string | null = null): void {
  demoModeActive = active
  demoScenarioId = active ? scenarioId : null
}

export function isTutorialDemoMode(): boolean {
  return demoModeActive
}

export function getTutorialDemoScenarioId(): string | null {
  return demoScenarioId
}

export class TutorialDemoBlockedError extends Error {
  constructor(action: string) {
    super(`[tutorial-demo] 已阻止真实调用：${action}`)
    this.name = "TutorialDemoBlockedError"
  }
}

/**
 * 在生成 / 提交 / 扣费入口调用。
 * demo 模式下抛错，防止漏网请求。
 */
export function assertNotDemoMode(action: string): void {
  if (demoModeActive) {
    throw new TutorialDemoBlockedError(action)
  }
}

/**
 * 软守卫：demo 模式下返回 false，调用方可 toast 提示。
 */
export function guardDemoAction(action: string): boolean {
  if (!demoModeActive) return true
  if (typeof console !== "undefined") {
    console.info(`[tutorial-demo] blocked: ${action}`)
  }
  return false
}

/**
 * 包装 fetch：demo 模式下拒绝命中高成本路径。
 * 正常模式透传。
 */
const BLOCKED_PATH_PREFIXES = [
  "/api/ai/",
  "/api/dh-video-v2/",
  "/api/video/",
  "/api/promo-video/",
  "/api/geo/",
  "/api/copywriting/",
  "/api/credit/consume",
]

export function isBlockedTutorialFetchUrl(url: string): boolean {
  try {
    const path = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0]
    return BLOCKED_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))
  } catch {
    return BLOCKED_PATH_PREFIXES.some((prefix) => url.includes(prefix))
  }
}

/**
 * 可选的全局 fetch 包装安装。仅在进入 demo 时调用；退出时 uninstall。
 */
let originalFetch: typeof fetch | null = null
let fetchGuardInstalled = false

export function installTutorialFetchGuard(): void {
  if (typeof window === "undefined" || fetchGuardInstalled) return
  originalFetch = window.fetch.bind(window)
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (demoModeActive && isBlockedTutorialFetchUrl(url)) {
      throw new TutorialDemoBlockedError(`fetch ${url}`)
    }
    return originalFetch!(input, init)
  }) as typeof fetch
  fetchGuardInstalled = true
}

export function uninstallTutorialFetchGuard(): void {
  if (typeof window === "undefined" || !fetchGuardInstalled || !originalFetch) return
  window.fetch = originalFetch
  originalFetch = null
  fetchGuardInstalled = false
}
