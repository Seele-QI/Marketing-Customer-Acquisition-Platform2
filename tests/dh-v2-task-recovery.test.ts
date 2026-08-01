import assert from "node:assert/strict"
import test from "node:test"

import { dhVideoV2Adapter } from "../lib/task-runtime/adapters/dh-video-v2.ts"
import type { RuntimeTask } from "../lib/task-runtime/types.ts"

test("temporary status network failure is retried by the runtime instead of ending the task", async () => {
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      throw new TypeError("fetch failed")
    },
  })

  const task: RuntimeTask = {
    kind: "dh-video-v2",
    taskId: "dhv2_recoverable",
    status: "running",
    progress: 30,
    stageLabel: "生成中",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    result: {},
    meta: {},
  }

  try {
    await assert.rejects(dhVideoV2Adapter.poll(task), /无法连接/)
  } finally {
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

