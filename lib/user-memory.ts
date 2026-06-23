/**
 * 全局用户记忆系统
 * ─────────────────────────────────────────────
 * 在文案创作对话中自动提取用户关键信息（行业/偏好/目标/事实），
 * 持久化到 localStorage，并在后续对话中自动注入到 System Prompt。
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type UserMemory = {
  /** 用户所在行业 */
  industry: string
  /** 用户角色/职位 */
  role: string
  /** 用户目标 */
  goals: string[]
  /** 内容偏好（平台、风格、形式等） */
  preferences: string[]
  /** AI 提取的关键事实 */
  facts: string[]
  /** 最后更新时间 */
  lastUpdated: string
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STORAGE_KEY = "copywriting-user-memory-v1"
const MAX_GOALS = 5
const MAX_PREFERENCES = 8
const MAX_FACTS = 15

/* ------------------------------------------------------------------ */
/*  Default                                                             */
/* ------------------------------------------------------------------ */

function defaultMemory(): UserMemory {
  return {
    industry: "",
    role: "",
    goals: [],
    preferences: [],
    facts: [],
    lastUpdated: "",
  }
}

/* ------------------------------------------------------------------ */
/*  Read / Write                                                        */
/* ------------------------------------------------------------------ */

export function readUserMemory(): UserMemory {
  if (typeof window === "undefined") return defaultMemory()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultMemory()
    const data = JSON.parse(raw) as Partial<UserMemory>
    return {
      industry: typeof data.industry === "string" ? data.industry.slice(0, 100) : "",
      role: typeof data.role === "string" ? data.role.slice(0, 100) : "",
      goals: sanitizeArray(data.goals, MAX_GOALS),
      preferences: sanitizeArray(data.preferences, MAX_PREFERENCES),
      facts: sanitizeArray(data.facts, MAX_FACTS),
      lastUpdated: typeof data.lastUpdated === "string" ? data.lastUpdated : "",
    }
  } catch {
    return defaultMemory()
  }
}

export function writeUserMemory(memory: UserMemory): void {
  if (typeof window === "undefined") return
  try {
    const payload: UserMemory = {
      industry: memory.industry.slice(0, 100),
      role: memory.role.slice(0, 100),
      goals: sanitizeArray(memory.goals, MAX_GOALS),
      preferences: sanitizeArray(memory.preferences, MAX_PREFERENCES),
      facts: sanitizeArray(memory.facts, MAX_FACTS),
      lastUpdated: new Date().toISOString(),
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    /* quota exceeded or private mode */
  }
}

/** 合并部分更新到现有记忆 */
export function updateUserMemory(partial: Partial<UserMemory>): UserMemory {
  const current = readUserMemory()
  const merged: UserMemory = {
    industry: partial.industry ?? current.industry,
    role: partial.role ?? current.role,
    goals: mergeArray(current.goals, partial.goals ?? [], MAX_GOALS),
    preferences: mergeArray(current.preferences, partial.preferences ?? [], MAX_PREFERENCES),
    facts: mergeArray(current.facts, partial.facts ?? [], MAX_FACTS),
    lastUpdated: new Date().toISOString(),
  }
  writeUserMemory(merged)
  return merged
}

/** 清除所有记忆 */
export function clearUserMemory(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Context Builder                                                     */
/* ------------------------------------------------------------------ */

/** 生成注入到 System Prompt 的记忆上下文文本 */
export function buildMemoryContext(): string {
  const m = readUserMemory()
  const lines: string[] = []

  if (m.industry) lines.push(`- 行业/赛道：${m.industry}`)
  if (m.role) lines.push(`- 角色/职位：${m.role}`)
  if (m.goals.length > 0) lines.push(`- 目标：${m.goals.join("、")}`)
  if (m.preferences.length > 0) lines.push(`- 偏好：${m.preferences.join("、")}`)
  if (m.facts.length > 0) lines.push(`- 已知信息：${m.facts.join("；")}`)

  if (lines.length === 0) return ""

  return [
    "",
    "## 用户记忆（从之前的对话中提取）",
    ...lines,
    "",
    "请基于以上用户信息进行个性化创作。如果用户提供了新信息，可在回复中自然提及。",
  ].join("\n")
}

/** 检查是否有任何用户记忆 */
export function hasUserMemory(): boolean {
  const m = readUserMemory()
  return !!(m.industry || m.role || m.goals.length > 0 || m.preferences.length > 0 || m.facts.length > 0)
}

/** 获取记忆摘要（用于 UI 展示） */
export function getMemorySummary(): string {
  const m = readUserMemory()
  const parts: string[] = []
  if (m.industry) parts.push(`行业：${m.industry}`)
  if (m.role) parts.push(`角色：${m.role}`)
  if (m.goals.length > 0) parts.push(`目标：${m.goals[0]}`)
  return parts.join(" · ") || "暂无记忆"
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function sanitizeArray(arr: unknown, max: number): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    .map((x) => x.slice(0, 200).trim())
    .slice(0, max)
}

function mergeArray(existing: string[], incoming: string[], max: number): string[] {
  const seen = new Set(existing.map((x) => x.toLowerCase()))
  const merged = [...existing]
  for (const item of incoming) {
    if (!seen.has(item.toLowerCase())) {
      merged.push(item)
      seen.add(item.toLowerCase())
    }
  }
  return merged.slice(0, max)
}
