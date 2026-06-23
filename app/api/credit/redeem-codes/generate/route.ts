import { NextResponse } from "next/server"

import { getAdminAccessKey } from "@/lib/server-env"
import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const expected = getAdminAccessKey()
  const rawCookie = req.headers.get("cookie") || ""
  let cookieKey = ""
  for (const chunk of rawCookie.split(";")) {
    const [name, ...rest] = chunk.trim().split("=")
    if (name === "credit_admin_key") {
      cookieKey = rest.join("=").trim()
      break
    }
  }

  if (!expected) {
    return NextResponse.json(
      { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
      { status: 503 },
    )
  }
  if (!cookieKey || cookieKey !== expected) {
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
  return proxyToFastapi(upstreamReq, "/api/credit/redeem-codes/generate")
}
