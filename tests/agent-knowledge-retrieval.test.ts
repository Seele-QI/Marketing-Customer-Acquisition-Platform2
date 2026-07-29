import assert from "node:assert/strict"
import test from "node:test"

import { retrieveAgentKnowledge } from "../lib/agents/server-store.ts"

test("retrieval sends the internal key server-side and filters exact scopes", async () => {
  const calls: Array<{ body: Record<string, unknown>; headers: Headers }> = []
  const fetchImpl = (async (_input: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>
    calls.push({ body, headers: new Headers(init?.headers) })
    return Response.json({
      items: [{ id: `item-${body.scope}`, name: "制度", scope: body.scope, text: `${body.scope}证据` }],
    })
  }) as typeof fetch

  const result = await retrieveAgentKnowledge({
    baseUrl: "http://cloud.test",
    meteredKey: "secret-key",
    cookieHeader: "session_id=sid",
    query: "合同",
    runId: "run-1",
    departmentIds: ["legal-compliance"],
    fetchImpl,
  })
  assert.equal(result.status, "loaded")
  assert.equal(result.items.length, 3)
  assert.deepEqual(calls.map((call) => call.body.scope).sort(), ["company", "department", "task"])
  assert.equal(calls.find((call) => call.body.scope === "department")?.body.departmentId, "legal-compliance")
  assert.equal(calls.find((call) => call.body.scope === "task")?.body.taskId, "run-1")
  assert.ok(calls.every((call) => call.headers.get("X-Metered-Key") === "secret-key"))
})

test("retrieval fails soft with a bounded unavailable warning and no secret leakage", async () => {
  const result = await retrieveAgentKnowledge({
    baseUrl: "http://cloud.test",
    meteredKey: "top-secret",
    cookieHeader: "session_id=sid",
    query: "合同",
    runId: "run-1",
    departmentIds: ["legal-compliance"],
    fetchImpl: (async () => {
      throw new Error("top-secret upstream exploded")
    }) as typeof fetch,
  })
  assert.equal(result.status, "unavailable")
  assert.deepEqual(result.items, [])
  assert.ok(!JSON.stringify(result).includes("top-secret"))
})
