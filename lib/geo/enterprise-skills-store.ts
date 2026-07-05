/**
 * 客户端 localStorage 存储：用户生成的 C 层企业知识库 Skill。
 * Key: geo-enterprise-skills-v1
 */

export type EnterpriseSkill = {
  id: string
  label: string
  description: string
  content: string
  provider: string
  createdAt: string
  default?: boolean
}

const STORAGE_KEY = "geo-enterprise-skills-v1"
const MAX_SKILLS = 20
const MAX_CONTENT_BYTES = 32_768

function readAll(): EnterpriseSkill[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (s): s is EnterpriseSkill =>
        s &&
        typeof s === "object" &&
        typeof (s as EnterpriseSkill).id === "string" &&
        typeof (s as EnterpriseSkill).label === "string" &&
        typeof (s as EnterpriseSkill).content === "string",
    )
  } catch {
    return []
  }
}

function writeAll(skills: EnterpriseSkill[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(skills))
  window.dispatchEvent(new CustomEvent("geo-enterprise-skills-changed"))
}

export function listEnterpriseSkills(): EnterpriseSkill[] {
  return readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getEnterpriseSkillById(id: string | null | undefined): EnterpriseSkill | undefined {
  if (!id) return undefined
  return readAll().find((s) => s.id === id)
}

export function getDefaultEnterpriseSkill(): EnterpriseSkill | undefined {
  const all = readAll()
  return all.find((s) => s.default) ?? all[0]
}

export function addEnterpriseSkill(skill: EnterpriseSkill): EnterpriseSkill {
  const contentBytes = new TextEncoder().encode(skill.content).length
  if (contentBytes > MAX_CONTENT_BYTES) {
    throw new Error(`Skill 正文超过 ${MAX_CONTENT_BYTES / 1024}KB 上限，请精简后保存`)
  }

  const all = readAll()
  if (all.length >= MAX_SKILLS) {
    throw new Error(`最多保存 ${MAX_SKILLS} 个企业 Skill，请先删除旧条目`)
  }

  const isFirst = all.length === 0
  const entry: EnterpriseSkill = {
    ...skill,
    default: skill.default ?? isFirst,
  }

  const next: EnterpriseSkill[] = entry.default
    ? all.map((s) => ({ ...s, default: false }))
    : [...all]
  next.unshift(entry)
  writeAll(next)
  return entry
}

export function removeEnterpriseSkill(id: string): void {
  const all = readAll()
  const removed = all.find((s) => s.id === id)
  const next = all.filter((s) => s.id !== id)
  if (removed?.default && next.length > 0) {
    next[0] = { ...next[0], default: true }
  }
  writeAll(next)
}

export function setDefaultEnterpriseSkill(id: string): void {
  const all = readAll()
  if (!all.some((s) => s.id === id)) return
  writeAll(all.map((s) => ({ ...s, default: s.id === id })))
}

export function updateEnterpriseSkill(
  id: string,
  patch: Partial<Pick<EnterpriseSkill, "label" | "description" | "content">>,
): EnterpriseSkill {
  const all = readAll()
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) throw new Error("Skill 不存在")

  const current = all[idx]
  const nextContent = patch.content ?? current.content
  const contentBytes = new TextEncoder().encode(nextContent).length
  if (contentBytes > MAX_CONTENT_BYTES) {
    throw new Error(`Skill 正文超过 ${MAX_CONTENT_BYTES / 1024}KB 上限，请精简后保存`)
  }

  const label = (patch.label ?? current.label).trim()
  if (!label) throw new Error("Skill 名称不能为空")
  if (!nextContent.trim()) throw new Error("Skill 正文不能为空")

  const updated: EnterpriseSkill = {
    ...current,
    label,
    description: (patch.description ?? current.description).trim(),
    content: nextContent,
  }
  const next = [...all]
  next[idx] = updated
  writeAll(next)
  return updated
}

export { STORAGE_KEY as ENTERPRISE_SKILLS_STORAGE_KEY }
