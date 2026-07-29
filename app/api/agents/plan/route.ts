import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { buildPublicAgentPlan } from "@/lib/agents/plan"

export const runtime = "nodejs"

export const POST = withAuth(async (request) => {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }
  const result = buildPublicAgentPlan(raw)
  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }
  return NextResponse.json(result.value)
})

