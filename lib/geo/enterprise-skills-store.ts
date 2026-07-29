/**
 * 客户端 localStorage 存储：用户生成的 C 层企业知识库 Skill。
 * Key: geo-enterprise-skills-v1
 */

import type { EnterpriseSkillQualityReport } from "@/lib/geo/enterprise-skill-quality"

export type EnterpriseSkill = {
  id: string
  label: string
  description: string
  content: string
  provider: string
  createdAt: string
  default?: boolean
  quality?: EnterpriseSkillQualityReport
}

const STORAGE_KEY = "geo-enterprise-skills-v1"
const MAX_SKILLS = 20
const MAX_CONTENT_BYTES = 32_768

export function enterpriseSkillsStorageKey(accountScope: string): string {
  const normalized = accountScope.trim()
  if (!normalized) throw new Error("account scope is required")
  return `${STORAGE_KEY}:${encodeURIComponent(normalized)}`
}

function parseSkills(raw: string | null): EnterpriseSkill[] {
  if (!raw) return []
  const parsed = JSON.parse(raw) as unknown
  if (!Array.isArray(parsed)) return []
  return parsed.filter(
    (skill): skill is EnterpriseSkill =>
      Boolean(skill) &&
      typeof skill === "object" &&
      typeof (skill as EnterpriseSkill).id === "string" &&
      typeof (skill as EnterpriseSkill).label === "string" &&
      typeof (skill as EnterpriseSkill).content === "string",
  )
}

function readAll(accountScope: string): EnterpriseSkill[] {
  if (typeof window === "undefined") return []
  try {
    return parseSkills(localStorage.getItem(enterpriseSkillsStorageKey(accountScope)))
  } catch {
    return []
  }
}

function writeAll(accountScope: string, skills: EnterpriseSkill[]): void {
  if (typeof window === "undefined") return
  localStorage.setItem(enterpriseSkillsStorageKey(accountScope), JSON.stringify(skills))
  window.dispatchEvent(new CustomEvent("geo-enterprise-skills-changed", { detail: { accountScope } }))
}

export function listLegacyEnterpriseSkills(): EnterpriseSkill[] {
  if (typeof window === "undefined") return []
  try { return parseSkills(localStorage.getItem(STORAGE_KEY)) } catch { return [] }
}

export function claimLegacyEnterpriseSkills(accountScope: string): number {
  const legacy = listLegacyEnterpriseSkills()
  if (!legacy.length) return 0
  const current = readAll(accountScope)
  const currentIds = new Set(current.map((skill) => skill.id))
  const claimable = legacy.filter((skill) => !currentIds.has(skill.id))
  if (current.length + claimable.length > MAX_SKILLS) {
    throw new Error(`迁移后将超过 ${MAX_SKILLS} 个企业 Skill，请先删除当前账号中的旧条目`)
  }
  writeAll(accountScope, [...claimable, ...current])
  localStorage.removeItem(STORAGE_KEY)
  return claimable.length
}

export function listEnterpriseSkills(accountScope: string): EnterpriseSkill[] {
  return readAll(accountScope).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export function getEnterpriseSkillById(accountScope: string, id: string | null | undefined): EnterpriseSkill | undefined {
  if (!id) return undefined
  return readAll(accountScope).find((s) => s.id === id)
}

export function getDefaultEnterpriseSkill(accountScope: string): EnterpriseSkill | undefined {
  const all = readAll(accountScope)
  return all.find((s) => s.default) ?? all[0]
}

export function addEnterpriseSkill(accountScope: string, skill: EnterpriseSkill): EnterpriseSkill {
  const contentBytes = new TextEncoder().encode(skill.content).length
  if (contentBytes > MAX_CONTENT_BYTES) {
    throw new Error(`Skill 正文超过 ${MAX_CONTENT_BYTES / 1024}KB 上限，请精简后保存`)
  }

  const all = readAll(accountScope)
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
  writeAll(accountScope, next)
  return entry
}

export function removeEnterpriseSkill(accountScope: string, id: string): void {
  const all = readAll(accountScope)
  const removed = all.find((s) => s.id === id)
  const next = all.filter((s) => s.id !== id)
  if (removed?.default && next.length > 0) {
    next[0] = { ...next[0], default: true }
  }
  writeAll(accountScope, next)
}

export function setDefaultEnterpriseSkill(accountScope: string, id: string): void {
  const all = readAll(accountScope)
  if (!all.some((s) => s.id === id)) return
  writeAll(accountScope, all.map((s) => ({ ...s, default: s.id === id })))
}

export function updateEnterpriseSkill(
  accountScope: string,
  id: string,
  patch: Partial<Pick<EnterpriseSkill, "label" | "description" | "content">>,
): EnterpriseSkill {
  const all = readAll(accountScope)
  const idx = all.findIndex((s) => s.id === id)
  if (idx < 0) throw new Error("Skill 不存在")

  const current = all[idx]
  const nextContent = patch.content ?? current.content
  const contentChanged = patch.content !== undefined && patch.content !== current.content
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
    quality: contentChanged ? undefined : current.quality,
  }
  const next = [...all]
  next[idx] = updated
  writeAll(accountScope, next)
  return updated
}

export { STORAGE_KEY as ENTERPRISE_SKILLS_STORAGE_KEY }
