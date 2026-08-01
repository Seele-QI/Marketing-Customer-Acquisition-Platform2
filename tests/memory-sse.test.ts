import assert from "node:assert/strict"
import test from "node:test"

import { consumeBillingAwareSseStream } from "../lib/credit/balance-sync.ts"

test("memory, normal deltas, billing, billing_error, and done coexist in one SSE stream", async () => {
  const response = new Response(
    [
      'event: memory\ndata: {"status":"loaded","count":2,"items":[{"id":"m1"}]}\n\n',
      'data: {"choices":[{"delta":{"content":"第一段"}}]}\n\n',
      'event: billing\ndata: {"costCredits":3,"balance":99}\n\n',
      'event: billing_error\ndata: {"code":"LATE_ERROR"}\n\n',
      'data: {"type":"response.output_text.delta","delta":"第二段"}\n\n',
      "data: [DONE]\n\n",
    ].join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  )
  const deltas: string[] = []
  const memories: unknown[] = []

  await consumeBillingAwareSseStream(
    response,
    (delta) => deltas.push(delta),
    undefined,
    (memory) => memories.push(memory),
  )

  assert.deepEqual(deltas, ["第一段", "第二段"])
  assert.deepEqual(memories, [{ status: "loaded", count: 2, items: [{ id: "m1" }] }])
})

test("malformed memory metadata is ignored without interrupting deltas", async () => {
  const response = new Response(
    'event: memory\ndata: not-json\n\ndata: {"choices":[{"delta":{"content":"仍然输出"}}]}\n\n',
  )
  const deltas: string[] = []
  const memories: unknown[] = []

  await consumeBillingAwareSseStream(
    response,
    (delta) => deltas.push(delta),
    undefined,
    (memory) => memories.push(memory),
  )

  assert.deepEqual(deltas, ["仍然输出"])
  assert.deepEqual(memories, [])
})
