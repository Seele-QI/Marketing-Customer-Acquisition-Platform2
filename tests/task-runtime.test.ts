import assert from "node:assert/strict"
import test from "node:test"

import {
  RUNTIME_STORAGE_KEY,
  createRuntimeTask,
  loadRuntimeStore,
  saveRuntimeStore,
} from "../lib/task-runtime/store.ts"
import { HISTORY_MAX_AGE_MS } from "../lib/video/types.ts"

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

test("runtime store persists and loads running tasks", () => {
  const storage = createMemoryStorage()
  withMockBrowserEnv(storage, () => {
    const task = createRuntimeTask({
      kind: "image-video",
      taskId: "iv_1",
      progress: 40,
      stageLabel: "识别中",
      meta: { script: "hello" },
    })
    saveRuntimeStore({ "image-video": task })
    assert.ok(storage.getItem(RUNTIME_STORAGE_KEY))

    const loaded = loadRuntimeStore()
    assert.equal(loaded["image-video"]?.taskId, "iv_1")
    assert.equal(loaded["image-video"]?.status, "running")
    assert.equal(loaded["image-video"]?.progress, 40)
    assert.equal(loaded["image-video"]?.meta?.script, "hello")
  })
})

test("runtime store sanitizes invalid status to running", () => {
  const storage = createMemoryStorage({
    [RUNTIME_STORAGE_KEY]: JSON.stringify({
      mashup: {
        kind: "mashup",
        taskId: "mv_1",
        status: "weird",
        progress: 10,
        stageLabel: "x",
        createdAt: 1,
        updatedAt: 1,
      },
    }),
  })
  withMockBrowserEnv(storage, () => {
    const loaded = loadRuntimeStore()
    assert.equal(loaded.mashup?.status, "running")
  })
})

test("HISTORY_MAX_AGE_MS is 14 days", () => {
  assert.equal(HISTORY_MAX_AGE_MS, 14 * 24 * 60 * 60 * 1000)
})

test("14-day cutoff filters old history records", () => {
  const now = Date.now()
  const records = [
    { id: "old", createdAt: now - 15 * 24 * 60 * 60 * 1000 },
    { id: "new", createdAt: now - 1 * 24 * 60 * 60 * 1000 },
  ]
  const cutoff = now - HISTORY_MAX_AGE_MS
  const kept = records.filter((r) => r.createdAt > cutoff)
  assert.equal(kept.length, 1)
  assert.equal(kept[0]!.id, "new")
})
