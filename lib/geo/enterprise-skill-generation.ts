import type { GeoOfficialContact } from "@/lib/geo/entity-types"
import { buildEnterpriseSkillRepairPrompt } from "@/lib/geo/enterprise-skill-prompt"
import {
  ensureEnterpriseSkillSections,
  inspectEnterpriseSkill,
  normalizeEnterpriseSkill,
  type EnterpriseSkillQualityReport,
} from "@/lib/geo/enterprise-skill-quality"
import { ensureOfficialContactSection } from "@/lib/geo/official-contact"

export type EnterpriseSkillCompletionInput = {
  system: string
  user: string
  maxTokens: number
}

export type EnterpriseSkillCompletion = (
  input: EnterpriseSkillCompletionInput,
) => Promise<string>

export type GenerateEnterpriseSkillContentInput = {
  complete: EnterpriseSkillCompletion
  system: string
  user: string
  contact: GeoOfficialContact
}

export type GeneratedEnterpriseSkillContent = {
  content: string
  quality: EnterpriseSkillQualityReport
}

const GENERATION_MAX_TOKENS = 6_000

function prepareDraft(content: string, contact: GeoOfficialContact): string {
  return ensureOfficialContactSection(normalizeEnterpriseSkill(content), contact)
}

function finalizeSafely(content: string, contact: GeoOfficialContact): string {
  const structured = ensureEnterpriseSkillSections(normalizeEnterpriseSkill(content))
  const exactContact = ensureOfficialContactSection(structured, contact)
  return normalizeEnterpriseSkill(exactContact)
}

export async function generateEnterpriseSkillContent(
  input: GenerateEnterpriseSkillContentInput,
): Promise<GeneratedEnterpriseSkillContent> {
  const firstDraft = await input.complete({
    system: input.system,
    user: input.user,
    maxTokens: GENERATION_MAX_TOKENS,
  })
  const prepared = prepareDraft(firstDraft, input.contact)
  const initialQuality = inspectEnterpriseSkill(prepared)

  if (initialQuality.passed) {
    return {
      content: prepared,
      quality: { ...initialQuality, repaired: false },
    }
  }

  let repairedDraft = prepared
  try {
    repairedDraft = await input.complete({
      system: input.system,
      user: buildEnterpriseSkillRepairPrompt(prepared, initialQuality.issues),
      maxTokens: GENERATION_MAX_TOKENS,
    })
  } catch {
    // The first model call returned usable source text. Keep the request useful
    // and let deterministic, non-fabricating fallbacks repair its structure.
  }

  const finalized = finalizeSafely(repairedDraft, input.contact)
  const quality = inspectEnterpriseSkill(finalized)
  return {
    content: finalized,
    quality: { ...quality, repaired: true },
  }
}
