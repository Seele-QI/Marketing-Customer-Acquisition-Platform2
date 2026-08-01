export type MatrixPlatformDef = {
  id: string
  label: string
  viralSkillId?: string
}

export const MATRIX_PLATFORMS: MatrixPlatformDef[] = [
  { id: "xiaohongshu", label: "小红书", viralSkillId: "viral-xiaohongshu" },
  { id: "douyin", label: "抖音", viralSkillId: "viral-douyin-content" },
  { id: "weibo", label: "微博", viralSkillId: "viral-weibo" },
  { id: "dianping", label: "大众点评", viralSkillId: "viral-dianping" },
  { id: "zhihu", label: "知乎", viralSkillId: "viral-zhihu" },
  { id: "ctrip", label: "携程", viralSkillId: "viral-ctrip" },
  { id: "netease", label: "网易", viralSkillId: "viral-netease" },
  { id: "sohu", label: "搜狐", viralSkillId: "viral-sohu" },
]

export const DEFAULT_MATRIX_PLATFORM_IDS = ["xiaohongshu", "douyin", "zhihu"]

const MATRIX_PLATFORM_IDS = new Set(MATRIX_PLATFORMS.map((platform) => platform.id))

/** 将客户端平台输入收敛到已支持的唯一平台，硬上限等于平台注册表长度。 */
export function sanitizeMatrixPlatformIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const unique = new Set<string>()
  for (const value of raw) {
    if (typeof value !== "string") continue
    const id = value.trim()
    if (!MATRIX_PLATFORM_IDS.has(id)) continue
    unique.add(id)
    if (unique.size >= MATRIX_PLATFORMS.length) break
  }
  return [...unique]
}

/** 兼容旧项目中的重复或已下线平台；完全无效时恢复产品默认选择。 */
export function normalizeMatrixPlatformSelection(raw: unknown): string[] {
  const sanitized = sanitizeMatrixPlatformIds(raw)
  return sanitized.length > 0 ? sanitized : [...DEFAULT_MATRIX_PLATFORM_IDS]
}

/** 矩阵固定 14 天（一日一格） */
export const MATRIX_DAYS = 14

export function getMatrixPlatform(id: string): MatrixPlatformDef | undefined {
  return MATRIX_PLATFORMS.find((p) => p.id === id)
}

export function getMatrixPlatformLabel(id: string): string {
  return getMatrixPlatform(id)?.label ?? id
}

/** 选中平台对应的 B 层 skill id，与用户勾选 union */
export function resolveViralSkillIds(
  platforms: string[],
  selectedViralIds?: string[] | null,
): string[] {
  const ids = new Set<string>(selectedViralIds ?? [])
  for (const pid of platforms) {
    const viralId = getMatrixPlatform(pid)?.viralSkillId
    if (viralId) ids.add(viralId)
  }
  return [...ids]
}

/** 按当前平台选择精确加载对应 B 层 Skill；忽略未知平台并保持平台注册顺序。 */
export function viralSkillIdsForPlatforms(platforms: string[]): string[] {
  const selected = new Set(platforms)
  return MATRIX_PLATFORMS.flatMap((platform) =>
    selected.has(platform.id) && platform.viralSkillId ? [platform.viralSkillId] : [],
  )
}

/** 矩阵起始日：当天本地日期（YYYY-MM-DD），不回退到周一 */
export function matrixStartDateIso(from: Date = new Date()): string {
  const y = from.getFullYear()
  const m = String(from.getMonth() + 1).padStart(2, "0")
  const d = String(from.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

/** @deprecated 使用 matrixStartDateIso；保留别名避免旧引用断裂 */
export function matrixStartMondayIso(from: Date = new Date()): string {
  return matrixStartDateIso(from)
}

/** startIso 起连续 n 天的 ISO 日期列表 */
export function matrixDateRange(startIso: string, days = MATRIX_DAYS): string[] {
  const dates: string[] = []
  const [y, m, d] = startIso.split("-").map(Number)
  const base = new Date(Date.UTC(y, m - 1, d))
  for (let i = 0; i < days; i++) {
    const cur = new Date(base)
    cur.setUTCDate(base.getUTCDate() + i)
    dates.push(cur.toISOString().slice(0, 10))
  }
  return dates
}

export function weekForMatrixDayIndex(dayIndex: number): 1 | 2 {
  return dayIndex < 7 ? 1 : 2
}
