import { NextResponse } from "next/server"

import { readAdminSessionCookie, verifyAdminSession } from "@/lib/admin-session"
import { getAdminAccessKey } from "@/lib/server-env"
import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

function adminForbidden() {
  return NextResponse.json(
    { detail: { code: "FORBIDDEN", message: "未授权的后台访问" } },
    { status: 403 },
  )
}

function adminNotConfigured() {
  return NextResponse.json(
    { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
    { status: 503 },
  )
}

function requireAdmin(req: Request): NextResponse | string {
  const expected = getAdminAccessKey()
  if (!expected) return adminNotConfigured()
  const token = readAdminSessionCookie(req)
  if (!verifyAdminSession(token)) return adminForbidden()
  return expected
}

export async function GET(req: Request) {
  const gate = requireAdmin(req)
  if (gate instanceof NextResponse) return gate
  const upstreamReq = new Request(req.url, {
    method: req.method,
    headers: { ...Object.fromEntries(req.headers.entries()), "X-Admin-Key": gate },
  })
  return proxyToFastapi(upstreamReq, "/api/credit/redeem-codes/items")
}
