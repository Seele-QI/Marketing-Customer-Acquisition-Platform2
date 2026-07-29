import crypto from "node:crypto"
import { NextResponse } from "next/server"

import {
  extractMemoryOperations,
  listMemoryExtractionProviders,
  type MemoryObservationInput,
} from "@/lib/llm/memory-extractor"
import { withAuth } from "@/lib/api/with-auth"
import { getCloudApiBase } from "@/lib/fastapi-base"

export const maxDuration = 60

type Body = {
  scope?: "copywriting" | "positioning" | "geo"
  sessionId?: string
  messageId?: string
  userMessage?: string
  messages?: Array<{ role?: string; content?: string }>
}

type ObserveResponse = {
  observationId?: string
  claimed?: MemoryObservationInput[]
}

function lastUserMessage(body: Body): string {
  if (typeof body.userMessage === "string" && body.userMessage.trim()) {
    return body.userMessage.trim().slice(0, 12_000)
  }
  const messages = Array.isArray(body.messages) ? body.messages : []
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index]
    if (row?.role === "user" && typeof row.content === "string" && row.content.trim()) {
      return row.content.trim().slice(0, 12_000)
    }
  }
  return ""
}

function internalHeaders(cookieHeader: string): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Cookie: cookieHeader,
  }
  const key = (process.env.CREDIT_METERED_KEY || "").trim()
  if (key) headers["X-Metered-Key"] = key
  return headers
}

async function markRetryableFailure(input: {
  base: string
  cookieHeader: string
  observationIds: string[]
}): Promise<void> {
  if (input.observationIds.length === 0) return
  await fetch(`${input.base}/api/memory/consolidate`, {
    method: "POST",
    headers: internalHeaders(input.cookieHeader),
    body: JSON.stringify({
      observationIds: input.observationIds,
      candidates: [],
      retryableFailure: true,
      errorCode: "MEMORY_EXTRACTION_FAILED",
    }),
  }).catch(() => {})
}

export const POST = withAuth(async (request, { cookieHeader }) => {
  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const text = lastUserMessage(body)
  if (!text) {
    return NextResponse.json({ detail: "缺少有效的用户消息" }, { status: 400 })
  }
  const base = getCloudApiBase()
  if (!base) {
    return NextResponse.json({ status: "retryable", updated: 0 }, { status: 202 })
  }
  const scope = body.scope === "positioning" || body.scope === "geo" ? body.scope : "copywriting"
  const sessionId = String(body.sessionId || `session-${crypto.randomUUID()}`).slice(0, 160)
  const messageId = String(body.messageId || crypto.randomUUID()).slice(0, 160)

  let observation: ObserveResponse
  try {
    const response = await fetch(`${base}/api/memory/observe`, {
      method: "POST",
      headers: internalHeaders(cookieHeader),
      body: JSON.stringify({ scope, sessionId, messageId, text }),
    })
    if (!response.ok) throw new Error(`MEMORY_OBSERVE_${response.status}`)
    observation = (await response.json()) as ObserveResponse
  } catch {
    return NextResponse.json({ status: "retryable", updated: 0 }, { status: 202 })
  }

  const claimed = Array.isArray(observation.claimed) ? observation.claimed : []
  if (claimed.length === 0) {
    return NextResponse.json({
      status: "queued",
      observationId: observation.observationId,
      updated: 0,
    })
  }

  const extraction = await extractMemoryOperations({
    providers: listMemoryExtractionProviders(),
    observations: claimed,
    signal: request.signal,
  })
  const observationIds = claimed.map((row) => row.id)
  if (!extraction.ok) {
    await markRetryableFailure({ base, cookieHeader, observationIds })
    return NextResponse.json({ status: "retryable", updated: 0 }, { status: 202 })
  }

  try {
    const response = await fetch(`${base}/api/memory/consolidate`, {
      method: "POST",
      headers: internalHeaders(cookieHeader),
      body: JSON.stringify({
        observationIds,
        candidates: extraction.operations,
      }),
    })
    if (!response.ok) throw new Error(`MEMORY_CONSOLIDATE_${response.status}`)
    const result = (await response.json()) as {
      created?: number
      reinforced?: number
      superseded?: number
    }
    const updated =
      Number(result.created || 0) + Number(result.reinforced || 0) + Number(result.superseded || 0)
    return NextResponse.json({
      status: updated > 0 ? "updated" : "queued",
      observationId: observation.observationId,
      updated,
    })
  } catch {
    await markRetryableFailure({ base, cookieHeader, observationIds })
    return NextResponse.json({ status: "retryable", updated: 0 }, { status: 202 })
  }
})
