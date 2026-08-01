import assert from "node:assert/strict"
import test from "node:test"

import {
  DRAFT_STORAGE_KEY,
  clearDraft,
  defaultImageVideoDraft,
  defaultDhVideoEconomyDraft,
  loadDraft,
  saveDraft,
} from "../lib/workflow-draft-store.ts"

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

test("workflow draft store saves and loads image-video draft", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    const draft = { ...defaultImageVideoDraft(), script: "hello", currentStep: 2 as const }
    saveDraft("image-video", draft)
    assert.ok(storage.getItem(DRAFT_STORAGE_KEY))
    const loaded = loadDraft("image-video")
    assert.equal(loaded?.script, "hello")
    assert.equal(loaded?.currentStep, 2)
    clearDraft("image-video")
    assert.equal(loadDraft("image-video"), null)
  })
})

test("workflow draft store isolates kinds", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    saveDraft("image-video", { script: "iv" })
    saveDraft("mashup", { script: "mv" })
    assert.equal(loadDraft("image-video")?.script, "iv")
    assert.equal(loadDraft("mashup")?.script, "mv")
  })
})

test("economy digital-human draft has independent defaults", () => {
  const draft = defaultDhVideoEconomyDraft()
  assert.equal(draft.script, "")
  assert.equal(draft.motionPreset, "natural")
  assert.equal(draft.coverAspectRatio, "9:16")
  assert.deepEqual(draft.imageRefs, [])
  assert.equal(draft.audioRef, null)
})
