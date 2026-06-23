import { NextResponse } from "next/server"

import { getAdminAccessKey } from "@/lib/server-env"
import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

function readAdminCookie(req: Request): string {
  const raw = req.headers.get("cookie") || ""
  for (const chunk of raw.split(";")) {
    const [name, ...rest] = chunk.trim().split("=")
    if (name === "credit_admin_key") return rest.join("=").trim()
  }
  return ""
}

export async function GET(req: Request) {
  const expected = getAdminAccessKey()
  if (!expected) {
    return NextResponse.json(
      { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
      { status: 503 },
    )
  }
  const cookieKey = readAdminCookie(req)
  if (!cookieKey || cookieKey !== expected) {
    return NextResponse.json(
      { detail: { code: "FORBIDDEN", message: "未授权的后台访问" } },
      { status: 403 },
    )
  }
  const upstreamReq = new Request(req.url, {
    method: req.method,
    headers: { ...Object.fromEntries(req.headers.entries()), "X-Admin-Key": expected },
  })
  return proxyToFastapi(upstreamReq, "/api/credit/redeem-codes")
}
