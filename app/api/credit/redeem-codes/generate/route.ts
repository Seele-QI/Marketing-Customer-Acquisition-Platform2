import { NextResponse } from "next/server"

import { readAdminSessionCookie, verifyAdminSession } from "@/lib/admin-session"
import { getAdminAccessKey } from "@/lib/server-env"
import { proxyToCloudApi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const expected = getAdminAccessKey()
  if (!expected) {
    return NextResponse.json(
      { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
      { status: 503 },
    )
  }
  const token = readAdminSessionCookie(req)
  if (!verifyAdminSession(token)) {
    return NextResponse.json(
      { detail: { code: "FORBIDDEN", message: "未授权的后台访问" } },
      { status: 403 },
    )
  }

  const upstreamReq = new Request(req.url, {
    method: req.method,
    headers: { ...Object.fromEntries(req.headers.entries()), "X-Admin-Key": expected },
    body: await req.text(),
  })
  return proxyToCloudApi(upstreamReq, "/api/credit/redeem-codes/generate")
}
