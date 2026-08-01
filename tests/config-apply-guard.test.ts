import assert from "node:assert/strict"
import test from "node:test"

import { waitForVideoTasksIdle } from "../electron/services/config-apply-guard.ts"

test("config apply waits for a running digital-human task before restarting services", async () => {
  const states = [true, true, false]
  let sleeps = 0

  const result = await waitForVideoTasksIdle({
    probeActive: async () => states.shift() ?? false,
    sleep: async () => {
      sleeps += 1
    },
    pollIntervalMs: 1,
    maxWaitMs: 10_000,
  })

  assert.equal(result, "idle")
  assert.equal(sleeps, 2)
})

