import assert from "node:assert/strict"
import test from "node:test"

import {
  IP_POSITIONING_SESSION_KEY,
  clearIpPositioningSession,
  defaultIpPositioningSession,
  loadIpPositioningSession,
  saveIpPositioningSession,
} from "../lib/ip-positioning-store.ts"

function createMemoryStorage(seed?: Record<string, string>) {
  const store = new Map(Object.entries(seed ?? {}))
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

function withMockBrowserEnv(storage: ReturnType<typeof createMemoryStorage>, run: () => void) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")

  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })

  try {
    run()
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor)
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.window
    }
    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor)
    } else {
      // @ts-expect-error test cleanup
      delete globalThis.localStorage
    }
  }
}

test("ip positioning session saves wizard step and intake", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    saveIpPositioningSession({
      wizardStep: 2,
      intake: { ...defaultIpPositioningSession().intake, industry: "教育" },
      modelId: "gpt-5.5",
    })
    assert.ok(storage.getItem(IP_POSITIONING_SESSION_KEY))
    const loaded = loadIpPositioningSession()
    assert.equal(loaded?.wizardStep, 2)
    assert.equal(loaded?.intake.industry, "教育")
    assert.equal(loaded?.modelId, "gpt-5.5")
  })
})

test("ip positioning session clear removes storage", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    saveIpPositioningSession({ wizardStep: 1 })
    clearIpPositioningSession()
    assert.equal(loadIpPositioningSession(), null)
  })
})

test("ip positioning session merges intake fields", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    saveIpPositioningSession({ intake: { industry: "A" } })
    saveIpPositioningSession({ intake: { resources: "B" } })
    const loaded = loadIpPositioningSession()
    assert.equal(loaded?.intake.industry, "A")
    assert.equal(loaded?.intake.resources, "B")
  })
})
