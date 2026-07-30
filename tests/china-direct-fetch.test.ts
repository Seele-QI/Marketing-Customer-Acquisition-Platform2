import assert from "node:assert/strict"
import test from "node:test"

import {
  fetchWithChinaDirectFallback,
  isArkChinaDirectHost,
} from "../lib/llm/china-direct-fetch.ts"

test("China direct fallback is restricted to the official Ark host", () => {
  assert.equal(
    isArkChinaDirectHost("https://ark.cn-beijing.volces.com/api/v3/chat/completions"),
    true,
  )
  assert.equal(isArkChinaDirectHost("https://api.deepseek.com/chat/completions"), false)
  assert.equal(isArkChinaDirectHost("not a URL"), false)
})

test("ordinary mainland providers keep the normal fetch path", async () => {
  let called = 0
  const response = await fetchWithChinaDirectFallback(
    "https://open.bigmodel.cn/api/paas/v4/chat/completions",
    { method: "POST", body: "{}" },
    1_000,
    (async () => {
      called += 1
      return Response.json({ ok: true })
    }) as typeof fetch,
  )
  assert.equal(called, 1)
  assert.equal(response.status, 200)
})
