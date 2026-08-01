import assert from "node:assert/strict"
import test from "node:test"

import { ensureDhVideoV2PlanScriptReady } from "../lib/dh-video-v2/api.ts"

test("plan readiness uses the already-loaded local config without syncing again", async () => {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, "fetch")
  let syncCalls = 0
  let readyCalls = 0

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      electronAPI: {
        isElectron: true,
        syncConfig: async () => {
          syncCalls += 1
          return { ok: true }
        },
      },
    },
  })
  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async () => {
      readyCalls += 1
      return Response.json({ ready: true, providers: ["sonetto_gpt"] })
    },
  })

  try {
    const result = await ensureDhVideoV2PlanScriptReady()
    assert.equal(result.ready, true)
    assert.equal(readyCalls, 1)
    assert.equal(syncCalls, 0)
  } finally {
    if (windowDescriptor) Object.defineProperty(globalThis, "window", windowDescriptor)
    else delete (globalThis as { window?: unknown }).window
    if (fetchDescriptor) Object.defineProperty(globalThis, "fetch", fetchDescriptor)
    else delete (globalThis as { fetch?: unknown }).fetch
  }
})

