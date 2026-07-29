import assert from "node:assert/strict"
import test from "node:test"

import {
  calculateDhV2PlanMaxTokens,
  runDhV2PlanProviderChain,
} from "../lib/dh-video-v2/plan-provider-chain.ts"

test("plan provider chain caps each attempt by both provider and total budgets", async () => {
  const timeouts: number[] = []
  let now = 1_000

  const result = await runDhV2PlanProviderChain({
    providers: ["sonetto_gpt", "deepseek"],
    providerTimeoutMs: 60_000,
    totalTimeoutMs: 90_000,
    now: () => now,
    call: async (provider, timeoutMs) => {
      timeouts.push(timeoutMs)
      if (provider === "sonetto_gpt") {
        now += 55_000
        return { ok: false as const, status: 502, detail: "primary timeout" }
      }
      return { ok: true as const, value: "fallback-result" }
    },
  })

  assert.deepEqual(timeouts, [60_000, 35_000])
  assert.deepEqual(result, {
    ok: true,
    provider: "deepseek",
    value: "fallback-result",
    errors: ["sonetto_gpt: primary timeout"],
  })
})

test("plan max tokens scales with requested segments instead of always asking for 8192", () => {
  assert.equal(calculateDhV2PlanMaxTokens(1), 2_048)
  assert.equal(calculateDhV2PlanMaxTokens(3), 3_600)
  assert.equal(calculateDhV2PlanMaxTokens(20), 6_144)
})

