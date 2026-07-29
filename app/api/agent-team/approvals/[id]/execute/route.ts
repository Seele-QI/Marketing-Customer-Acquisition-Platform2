import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { executeApprovedTool } from "@/lib/agents/approval-execution"
import { getCloudApiBase } from "@/lib/fastapi-base"

export const runtime = "nodejs"
export const maxDuration = 900

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return withAuth(async (authedRequest, { cookieHeader }) => {
  let body: { idempotencyKey?: unknown }
  try {
    body = (await authedRequest.json()) as typeof body
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }
  const approvalId = id.trim()
  const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : ""
  if (!approvalId || !idempotencyKey) {
    return NextResponse.json({ detail: "缺少审批 ID 或幂等键" }, { status: 400 })
  }
  const baseUrl = getCloudApiBase()
  const meteredKey = (process.env.CREDIT_METERED_KEY || "").trim()
  if (!baseUrl || !meteredKey) {
    return NextResponse.json(
      { detail: { code: "TOOL_SERVICE_UNAVAILABLE", message: "执行服务尚未配置" } },
      { status: 503 },
    )
  }
  const result = await executeApprovedTool({
    baseUrl,
    meteredKey,
    cookieHeader,
    approvalId,
    idempotencyKey,
  })
  const status =
    result.status === "completed" || result.status === "already_executed"
      ? 200
      : result.status === "partial"
        ? 207
        : result.status === "needs_configuration"
          ? 409
          : result.status === "rejected"
            ? 403
            : 502
  return NextResponse.json(result, { status })
  })(request)
}
