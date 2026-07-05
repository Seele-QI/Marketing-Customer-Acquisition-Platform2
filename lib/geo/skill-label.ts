import registry from "@/skills/geo/registry.json"

/** 客户端安全的 Skill 显示名（不读文件系统） */
export function skillLabel(skillId: string | null | undefined): string {
  if (!skillId) return ""
  return registry.skills.find((s) => s.id === skillId)?.label ?? skillId
}
