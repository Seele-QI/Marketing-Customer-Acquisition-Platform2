import assert from "node:assert/strict"
import test from "node:test"

import {
  DH_VIDEO_TASK_TIMEOUT_MS,
  DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS,
  CLIP_TASK_TIMEOUT_MS,
  PROMO_VIDEO_TASK_TIMEOUT_MS,
  COPYWRITING_EXTRACT_TASK_TIMEOUT_MS,
  getTaskHardTimeoutMs,
} from "../lib/task-runtime/constants.ts"
import {
  RUNTIME_STORAGE_KEY,
  createRuntimeTask,
  loadRuntimeStore,
  saveRuntimeStore,
} from "../lib/task-runtime/store.ts"
import {
  getPollRetryDelayMs,
  getTaskRuntime,
  resetTaskRuntimeForTests,
} from "../lib/task-runtime/runtime.ts"
import { queryDhVideoV2Status } from "../lib/dh-video-v2/api.ts"
import { dhVideoEconomyAdapter } from "../lib/task-runtime/adapters/dh-video-economy.ts"
import { promoVideoAdapter } from "../lib/task-runtime/adapters/promo.ts"
import type { RuntimeTask } from "../lib/task-runtime/types.ts"
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

test("dh-video-v2 hard timeout is 50 minutes", () => {
  assert.equal(DH_VIDEO_TASK_TIMEOUT_MS, 50 * 60 * 1000)
  assert.equal(getTaskHardTimeoutMs("dh-video-v2"), DH_VIDEO_TASK_TIMEOUT_MS)
  assert.equal(DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS, 65 * 60 * 1000)
  assert.equal(getTaskHardTimeoutMs("dh-video-economy"), DH_VIDEO_ECONOMY_TASK_TIMEOUT_MS)
  assert.equal(getTaskHardTimeoutMs("image-video"), CLIP_TASK_TIMEOUT_MS)
  assert.equal(getTaskHardTimeoutMs("mashup"), CLIP_TASK_TIMEOUT_MS)
  assert.equal(getTaskHardTimeoutMs("promo-video"), PROMO_VIDEO_TASK_TIMEOUT_MS)
  assert.equal(
    getTaskHardTimeoutMs("copywriting-extract"),
    COPYWRITING_EXTRACT_TASK_TIMEOUT_MS,
  )
  assert.equal(getTaskHardTimeoutMs("unknown"), null)
})

test("poll retry backoff grows and stays capped", () => {
  assert.equal(getPollRetryDelayMs(5_000, 1), 5_000)
  assert.equal(getPollRetryDelayMs(5_000, 2), 10_000)
  assert.equal(getPollRetryDelayMs(5_000, 3), 20_000)
  assert.equal(getPollRetryDelayMs(5_000, 4), 30_000)
  assert.equal(getPollRetryDelayMs(5_000, 20), 30_000)
})

test("starting an already-started runtime repairs a lost poll timer", async () => {
  const storage = createMemoryStorage()
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")

  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })
  let polls = 0
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      polls += 1
      return Response.json({
        task_id: "dhv2_timer_repair",
        status: "completed",
        progress: 100,
        result_url: "/static/video-postprocess/dh-v2/dhv2_timer_repair/final.mp4",
        segment_count: 1,
        segments_completed: 1,
        segments: [{ index: 0, status: "completed" }],
      })
    },
  })

  try {
    resetTaskRuntimeForTests()
    const runtime = getTaskRuntime()
    runtime.register({ kind: "dh-video-v2", taskId: "dhv2_timer_repair" })

    // Reproduce a timer disappearing while the singleton remains marked started.
    ;(runtime as unknown as { clearTimer(kind: string): void }).clearTimer("dh-video-v2")
    runtime.start()

    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.equal(polls, 1)
    assert.equal(runtime.getTask("dh-video-v2")?.status, "success")
  } finally {
    resetTaskRuntimeForTests()
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor)
    else delete (globalThis as { window?: unknown }).window
    if (localStorageDescriptor) Object.defineProperty(globalThis, "localStorage", localStorageDescriptor)
    else delete (globalThis as { localStorage?: unknown }).localStorage
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

test("dh-video-v2 status polling aborts a stalled request", async () => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: (_url: string, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true })
      }),
  })

  try {
    await assert.rejects(
      queryDhVideoV2Status("dhv2_stalled", { timeoutMs: 10 }),
      /状态查询超时/,
    )
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

test("dh-video-economy transient polling failures are delegated to runtime retry", async () => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      throw new TypeError("fetch failed")
    },
  })

  const task: RuntimeTask = {
    kind: "dh-video-economy",
    taskId: "dhe_transient_failure",
    status: "running",
    progress: 3,
    stageLabel: "校验素材",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }

  try {
    await assert.rejects(dhVideoEconomyAdapter.poll(task), /fetch failed/)
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

test("promo storyboard task-not-found is terminal instead of an infinite network retry", async () => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => Response.json({ detail: "Task not found" }, { status: 404 }),
  })
  const task: RuntimeTask = {
    kind: "promo-video",
    taskId: "pv_lost_after_restart",
    status: "running",
    progress: 30,
    stageLabel: "分镜继续进行中",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    meta: { phase: "storyboard" },
  }
  try {
    const outcome = await promoVideoAdapter.poll(task)
    assert.equal(outcome.type, "not_found")
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})
