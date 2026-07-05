import { skillSummary } from "@/lib/geo/skill-summary"

export type SkillContextInput = {
  modelSkillId?: string | null
  enterpriseSnapshot?: string | null
}

/** 拼装 A/C 层 Skill 上下文，供 ai-probe 等 API 注入 prompt */
export function buildSkillContextBlock(input: SkillContextInput): string {
  const parts: string[] = []

  const modelBlock = skillSummary(input.modelSkillId)
  if (modelBlock) {
    parts.push(`## A 层大模型引用策略\n${modelBlock}`)
  }

  const ent = (input.enterpriseSnapshot ?? "").trim()
  if (ent) {
    parts.push(`## C 层企业知识库\n${ent.slice(0, 4000)}`)
  }

  return parts.join("\n\n")
}
