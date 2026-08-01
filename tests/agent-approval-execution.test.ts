import assert from "node:assert/strict"
import test from "node:test"

import { executeApprovedTool } from "../lib/agents/approval-execution.ts"

test("approved publishing checks verified account, publishes once, and records evidence", async () => {
  const calls: string[] = []
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith("/api/agent-team/approvals/apr-1")) {
      return Response.json({
        approval: {
          id: "apr-1",
          status: "approved",
          action_type: "content_publish",
          expires_at: Math.floor(Date.now() / 1000) + 300,
          parameters: { platform: "douyin", videoUrl: "https://example/video.mp4", title: "标题" },
        },
        executionEvidence: null,
      })
    }
    if (url.endsWith("/api/publish/accounts")) {
      return Response.json({ accounts: [{ platform: "douyin", verified_at: 1, login_status: "valid" }] })
    }
    if (url.endsWith("/api/publish")) return Response.json({ success: true, publish_id: "p-1" })
    if (url.endsWith("/execution-evidence")) return Response.json({ evidence: { id: "e-1" } })
    return new Response("not found", { status: 404 })
  }) as typeof fetch

  const result = await executeApprovedTool({
    baseUrl: "http://cloud.test",
    meteredKey: "internal-key",
    cookieHeader: "session_id=sid",
    approvalId: "apr-1",
    idempotencyKey: "once-1",
    fetchImpl,
  })
  assert.equal(result.status, "completed")
  assert.equal(calls.filter((url) => url.endsWith("/api/publish")).length, 1)
})

test("execution blocks unconfigured tools and existing evidence without external action", async () => {
  let externalCalls = 0
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input)
    if (url.endsWith("/api/agent-team/approvals/apr-2")) {
      return Response.json({
        approval: {
          id: "apr-2",
          status: "approved",
          action_type: "email_send",
          expires_at: Math.floor(Date.now() / 1000) + 300,
          parameters: { to: "a@example.com" },
        },
        executionEvidence: null,
      })
    }
    externalCalls += 1
    return new Response("unexpected", { status: 500 })
  }) as typeof fetch
  const result = await executeApprovedTool({
    baseUrl: "http://cloud.test",
    meteredKey: "internal-key",
    cookieHeader: "session_id=sid",
    approvalId: "apr-2",
    idempotencyKey: "once-2",
    fetchImpl,
  })
  assert.equal(result.status, "needs_configuration")
  assert.equal(externalCalls, 0)
})
