import fs from "node:fs"
import path from "node:path"

const SKILL_ROOT = path.join(process.cwd(), "skills/copywriting")

type CopywritingSkillEntry = {
  id: string
  agentName: string
  label: string
  description: string
  path: string
}

type CopywritingRegistry = {
  skills: CopywritingSkillEntry[]
}

let cachedRegistry: CopywritingRegistry | null = null

function loadRegistry(): CopywritingRegistry {
  if (cachedRegistry) return cachedRegistry
  try {
    const raw = fs.readFileSync(path.join(SKILL_ROOT, "registry.json"), "utf-8")
    cachedRegistry = JSON.parse(raw) as CopywritingRegistry
    return cachedRegistry
  } catch {
    return { skills: [] }
  }
}

function readSkillExcerpt(relPath: string, maxChars = 2500): string {
  try {
    const full = path.join(SKILL_ROOT, relPath)
    const raw = fs.readFileSync(full, "utf-8")
    return raw.slice(0, maxChars)
  } catch {
    return ""
  }
}

/** agentName → skill registry id */
export function getCopywritingSkillId(agentName: string): string | null {
  const entry = loadRegistry().skills.find((s) => s.agentName === agentName)
  return entry?.id ?? null
}

/** Read skill excerpt for injection into system prompt */
export function copywritingSkillSummary(agentName: string): string {
  const entry = loadRegistry().skills.find((s) => s.agentName === agentName)
  if (!entry) return ""
  const body = readSkillExcerpt(entry.path, 2500)
  return `【${entry.label}】${entry.description}\n${body}`
}
