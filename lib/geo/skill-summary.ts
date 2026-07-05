import fs from "node:fs"
import path from "node:path"

import registry from "@/skills/geo/registry.json"

const SKILL_ROOT = path.join(process.cwd(), "skills/geo")

function readSkillExcerpt(relPath: string, maxChars = 4000): string {
  try {
    const full = path.join(SKILL_ROOT, relPath)
    const raw = fs.readFileSync(full, "utf-8")
    return raw.slice(0, maxChars)
  } catch {
    return ""
  }
}

export function skillSummary(skillId: string | null | undefined): string {
  if (!skillId) return ""
  const entry = registry.skills.find((s) => s.id === skillId)
  if (!entry) return ""
  const body = readSkillExcerpt(entry.path, 2500)
  return `【${entry.label}】${entry.description}\n${body}`
}
