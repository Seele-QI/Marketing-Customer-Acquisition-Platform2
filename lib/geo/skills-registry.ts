import registry from "@/skills/geo/registry.json"
import type { EnterpriseSkillQualityReport } from "@/lib/geo/enterprise-skill-quality"
import {
  listEnterpriseSkills as listStoredEnterpriseSkills,
  getDefaultEnterpriseSkill,
  type EnterpriseSkill,
} from "@/lib/geo/enterprise-skills-store"

export type GeoSkillLayer = "A" | "B" | "C"

export type GeoSkillCategory =
  | "creation-guidelines"
  | "research"
  | "publishing"
  | "model-weights"
  | "platform-viral"
  | "enterprise-knowledge"

export type GeoSkillEntry = {
  id: string
  layer?: GeoSkillLayer
  category: GeoSkillCategory
  label: string
  description: string
  path: string
  platform?: string
  default?: boolean
  /** C 层：完整 SKILL.md 正文（仅企业知识库） */
  content?: string
  provider?: string
  createdAt?: string
  quality?: EnterpriseSkillQualityReport
}

const SKILLS = registry.skills as GeoSkillEntry[]

function enterpriseSkillToEntry(skill: EnterpriseSkill): GeoSkillEntry {
  return {
    id: skill.id,
    layer: "C",
    category: "enterprise-knowledge",
    label: skill.label,
    description: skill.description,
    path: `localStorage://${skill.id}`,
    default: skill.default,
    content: skill.content,
    provider: skill.provider,
    createdAt: skill.createdAt,
    quality: skill.quality,
  }
}

/** C 层：读取 localStorage 中的用户生成 Skill（仅客户端） */
export function listEnterpriseSkills(accountScope: string): GeoSkillEntry[] {
  if (typeof window === "undefined") return []
  return listStoredEnterpriseSkills(accountScope).map(enterpriseSkillToEntry)
}

export function getEnterpriseSkillEntry(
  accountScope: string,
  id: string | null | undefined,
): GeoSkillEntry | undefined {
  if (!id) return undefined
  const stored = listStoredEnterpriseSkills(accountScope).find((s) => s.id === id)
  return stored ? enterpriseSkillToEntry(stored) : undefined
}

export function getDefaultEnterpriseSkillEntry(accountScope: string): GeoSkillEntry | undefined {
  if (typeof window === "undefined") return undefined
  const def = getDefaultEnterpriseSkill(accountScope)
  return def ? enterpriseSkillToEntry(def) : undefined
}

export function listGeoSkills(): GeoSkillEntry[] {
  return SKILLS
}

export function listAllGeoSkills(accountScope?: string): GeoSkillEntry[] {
  return [...SKILLS, ...(accountScope ? listEnterpriseSkills(accountScope) : [])]
}

export function listCreationGuidelineSkills(): GeoSkillEntry[] {
  return SKILLS.filter((s) => s.category === "creation-guidelines")
}

export function listModelWeightSkills(): GeoSkillEntry[] {
  return SKILLS.filter((s) => s.category === "model-weights")
}

export function listPlatformViralSkills(): GeoSkillEntry[] {
  return SKILLS.filter((s) => s.category === "platform-viral")
}

export function getGeoSkillById(id: string | null | undefined, accountScope?: string): GeoSkillEntry | undefined {
  if (!id) return undefined
  const staticSkill = SKILLS.find((s) => s.id === id)
  if (staticSkill) return staticSkill
  return accountScope ? getEnterpriseSkillEntry(accountScope, id) : undefined
}

export function getDefaultGeoSkill(): GeoSkillEntry | undefined {
  return SKILLS.find((s) => s.default && s.category === "creation-guidelines") ?? listCreationGuidelineSkills()[0]
}

export function getDefaultModelWeightSkill(): GeoSkillEntry | undefined {
  return listModelWeightSkills().find((s) => s.default) ?? listModelWeightSkills()[0]
}

/** 内容矩阵的新项目默认优先优化豆包引用；注册缺失时保持通用回退。 */
export function getDefaultMatrixModelWeightSkill(): GeoSkillEntry | undefined {
  return getGeoSkillById("model-doubao") ?? getDefaultModelWeightSkill()
}
