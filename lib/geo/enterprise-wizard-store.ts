import type { GeoEntityData } from "@/lib/geo/entity-types"
import type { EnterpriseConfirmedFields, EnterprisePrefill } from "@/lib/geo/enterprise-prefill"
import { EMPTY_OFFICIAL_CONTACT, sanitizeOfficialContact } from "@/lib/geo/official-contact"

export const ENTERPRISE_WIZARD_STORAGE_KEY = "geo-enterprise-wizard-v1"

export function enterpriseWizardStorageKey(accountScope: string): string {
  const normalized = accountScope.trim()
  if (!normalized) throw new Error("account scope is required")
  return `${ENTERPRISE_WIZARD_STORAGE_KEY}:${encodeURIComponent(normalized)}`
}

export type EnterpriseDocumentRef = { id: string; name: string; mime: string; size: number }
export type EnterpriseWizardDraft = {
  version: 1
  step: number
  maxStep: number
  entity: GeoEntityData
  confirmed: EnterpriseConfirmedFields
  documentRefs: EnterpriseDocumentRef[]
  prefill: EnterprisePrefill | null
  prefillStatus: "idle" | "loading" | "ready" | "manual"
  skillName: string
  updatedAt: number
}

export function emptyEnterpriseEntity(): GeoEntityData {
  return {
    companyName: "",
    industry: "",
    coreProduct: "",
    authorityLinks: [],
    authorityPages: [],
    faqs: [],
    officialContact: { ...EMPTY_OFFICIAL_CONTACT, primary: { ...EMPTY_OFFICIAL_CONTACT.primary } },
  }
}

export function defaultEnterpriseWizardDraft(): EnterpriseWizardDraft {
  return {
    version: 1,
    step: 0,
    maxStep: 0,
    entity: emptyEnterpriseEntity(),
    confirmed: { companyName: false, industry: false, coreProduct: false },
    documentRefs: [],
    prefill: null,
    prefillStatus: "idle",
    skillName: "",
    updatedAt: Date.now(),
  }
}

function normalize(raw: unknown): EnterpriseWizardDraft {
  const value = raw && typeof raw === "object" ? raw as Record<string, unknown> : {}
  const entityRaw = value.entity && typeof value.entity === "object" ? value.entity as Record<string, unknown> : {}
  const confirmedRaw = value.confirmed && typeof value.confirmed === "object" ? value.confirmed as Record<string, unknown> : {}
  const base = defaultEnterpriseWizardDraft()
  return {
    ...base,
    step: Math.max(0, Math.min(3, Math.floor(Number(value.step) || 0))),
    maxStep: Math.max(0, Math.min(3, Math.floor(Number(value.maxStep ?? value.step) || 0))),
    entity: {
      ...base.entity,
      companyName: String(entityRaw.companyName ?? "").trim(),
      industry: String(entityRaw.industry ?? "").trim(),
      coreProduct: String(entityRaw.coreProduct ?? "").trim(),
      officialContact: sanitizeOfficialContact(entityRaw.officialContact),
    },
    confirmed: {
      companyName: confirmedRaw.companyName === true,
      industry: confirmedRaw.industry === true,
      coreProduct: confirmedRaw.coreProduct === true,
    },
    documentRefs: Array.isArray(value.documentRefs)
      ? value.documentRefs.filter((ref): ref is EnterpriseDocumentRef => Boolean(ref && typeof ref === "object" && typeof (ref as EnterpriseDocumentRef).id === "string"))
      : [],
    prefill: value.prefill && typeof value.prefill === "object" ? value.prefill as EnterprisePrefill : null,
    prefillStatus: ["idle", "loading", "ready", "manual"].includes(String(value.prefillStatus))
      ? value.prefillStatus as EnterpriseWizardDraft["prefillStatus"]
      : "idle",
    skillName: String(value.skillName ?? "").trim().slice(0, 100),
    updatedAt: Number(value.updatedAt) || Date.now(),
  }
}

export function loadEnterpriseWizardDraft(accountScope: string): EnterpriseWizardDraft | null {
  if (typeof localStorage === "undefined") return null
  try {
    const raw = localStorage.getItem(enterpriseWizardStorageKey(accountScope))
    return raw ? normalize(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function saveEnterpriseWizardDraft(accountScope: string, patch: Partial<Omit<EnterpriseWizardDraft, "version" | "updatedAt">>): void {
  if (typeof localStorage === "undefined") return
  try {
    const previous = loadEnterpriseWizardDraft(accountScope) ?? defaultEnterpriseWizardDraft()
    const next = normalize({ ...previous, ...patch, entity: patch.entity ?? previous.entity, confirmed: patch.confirmed ?? previous.confirmed, updatedAt: Date.now() })
    localStorage.setItem(enterpriseWizardStorageKey(accountScope), JSON.stringify(next))
  } catch {
    // A draft is a convenience; quota failures must not block creation.
  }
}

export function clearEnterpriseWizardDraft(accountScope: string): void {
  if (typeof localStorage === "undefined") return
  try { localStorage.removeItem(enterpriseWizardStorageKey(accountScope)) } catch { /* noop */ }
}
