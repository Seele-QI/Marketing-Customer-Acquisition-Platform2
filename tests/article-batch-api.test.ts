import assert from "node:assert/strict"
import test from "node:test"

import { startBatchGenerate } from "../lib/geo/article-batch-api.ts"

test("batch API rejects SSE that ends before batch_complete", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      'data: {"type":"batch_start","batchId":"b1","total":1,"jobs":[]}\n\n',
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )
  try {
    await assert.rejects(
      () =>
        startBatchGenerate({
          mode: "matrix",
          projectId: "p1",
          dates: ["2026-07-01"],
        }),
      /提前结束/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test("batch API rejects a terminal batch-level error", async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () =>
    new Response(
      [
        'data: {"type":"job_error","jobId":"batch","error":"云端失败"}',
        'data: {"type":"batch_complete","successCount":0,"failCount":0}',
        "",
      ].join("\n\n"),
      { status: 200, headers: { "Content-Type": "text/event-stream" } },
    )
  try {
    await assert.rejects(
      () =>
        startBatchGenerate({
          mode: "matrix",
          projectId: "p1",
          dates: ["2026-07-01"],
        }),
      /云端失败/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})
