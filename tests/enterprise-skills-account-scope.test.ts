import assert from "node:assert/strict"
import test from "node:test"

import {
  addEnterpriseSkill,
  claimLegacyEnterpriseSkills,
  enterpriseSkillsStorageKey,
  listLegacyEnterpriseSkills,
  listEnterpriseSkills,
} from "../lib/geo/enterprise-skills-store.ts"

function browserStorageMock() {
  const map = new Map<string, string>()
  return {
    storage: { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value), removeItem: (key: string) => void map.delete(key) },
    window: { dispatchEvent: () => true },
  }
}

test("generated enterprise skills are isolated by authenticated account", () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const mock = browserStorageMock()
  Object.defineProperty(globalThis, "localStorage", { value: mock.storage, configurable: true })
  Object.defineProperty(globalThis, "window", { value: mock.window, configurable: true })
  try {
    const base = { description: "企业事实", content: "# 企业知识\n联系方式：13800000000", provider: "cloud", createdAt: "2026-07-22T00:00:00.000Z" }
    addEnterpriseSkill("user-1", { ...base, id: "a", label: "甲公司" })
    addEnterpriseSkill("user-2", { ...base, id: "b", label: "乙公司" })
    assert.deepEqual(listEnterpriseSkills("user-1").map((skill) => skill.id), ["a"])
    assert.deepEqual(listEnterpriseSkills("user-2").map((skill) => skill.id), ["b"])
    assert.notEqual(enterpriseSkillsStorageKey("user-1"), enterpriseSkillsStorageKey("user-2"))
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage)
    else delete (globalThis as { localStorage?: Storage }).localStorage
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else delete (globalThis as { window?: Window }).window
  }
})

test("legacy global skills move only after an explicit account claim", () => {
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
  const mock = browserStorageMock()
  Object.defineProperty(globalThis, "localStorage", { value: mock.storage, configurable: true })
  Object.defineProperty(globalThis, "window", { value: mock.window, configurable: true })
  try {
    mock.storage.setItem("geo-enterprise-skills-v1", JSON.stringify([{ id: "legacy", label: "旧知识库", description: "", content: "# 旧知识", provider: "cloud", createdAt: "2026-07-21T00:00:00.000Z" }]))
    assert.deepEqual(listEnterpriseSkills("user-9"), [])
    assert.equal(listLegacyEnterpriseSkills().length, 1)
    assert.equal(claimLegacyEnterpriseSkills("user-9"), 1)
    assert.deepEqual(listEnterpriseSkills("user-9").map((skill) => skill.id), ["legacy"])
    assert.equal(listLegacyEnterpriseSkills().length, 0)
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage)
    else delete (globalThis as { localStorage?: Storage }).localStorage
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow)
    else delete (globalThis as { window?: Window }).window
  }
})
