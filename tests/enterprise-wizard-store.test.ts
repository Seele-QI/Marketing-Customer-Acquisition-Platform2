import assert from "node:assert/strict"
import test from "node:test"

import {
  clearEnterpriseWizardDraft,
  ENTERPRISE_WIZARD_STORAGE_KEY,
  enterpriseWizardStorageKey,
  loadEnterpriseWizardDraft,
  saveEnterpriseWizardDraft,
} from "../lib/geo/enterprise-wizard-store.ts"

function storageMock() {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) }
}

test("wizard draft normalizes step and never persists model routing", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { value: storageMock(), configurable: true })
  try {
    saveEnterpriseWizardDraft("user-15", { step: 99, entity: { companyName: "精诚法税", industry: "", coreProduct: "" } } as never)
    const loaded = loadEnterpriseWizardDraft("user-15")!
    assert.equal(loaded.step, 3)
    assert.equal(loaded.entity.companyName, "精诚法税")
    assert.equal("modelId" in loaded, false)
    clearEnterpriseWizardDraft("user-15")
    assert.equal(localStorage.getItem(enterpriseWizardStorageKey("user-15")), null)
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous)
    else delete (globalThis as { localStorage?: Storage }).localStorage
  }
})

test("wizard drafts are isolated by authenticated account", () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  Object.defineProperty(globalThis, "localStorage", { value: storageMock(), configurable: true })
  try {
    saveEnterpriseWizardDraft("user-1", { entity: { companyName: "甲公司", industry: "甲行业", coreProduct: "甲产品" } } as never)
    saveEnterpriseWizardDraft("user-2", { entity: { companyName: "乙公司", industry: "乙行业", coreProduct: "乙产品" } } as never)
    assert.equal(loadEnterpriseWizardDraft("user-1")?.entity.companyName, "甲公司")
    assert.equal(loadEnterpriseWizardDraft("user-2")?.entity.companyName, "乙公司")
    assert.notEqual(enterpriseWizardStorageKey("user-1"), enterpriseWizardStorageKey("user-2"))
    assert.equal(ENTERPRISE_WIZARD_STORAGE_KEY, "geo-enterprise-wizard-v1")
  } finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous)
    else delete (globalThis as { localStorage?: Storage }).localStorage
  }
})
