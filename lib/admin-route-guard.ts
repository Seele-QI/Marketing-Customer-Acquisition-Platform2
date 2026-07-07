import { NextResponse } from "next/server"

import { readAdminSessionCookie, verifyAdminSession } from "@/lib/admin-session"
import { getAdminAccessKey } from "@/lib/server-env"

export const runtime = "nodejs"

export function adminForbidden() {
  return NextResponse.json(
    { detail: { code: "FORBIDDEN", message: "未授权的后台访问" } },
    { status: 403 },
  )
}

export function adminNotConfigured() {
  return NextResponse.json(
    { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
    { status: 503 },
  )
}

/** 校验 admin_session；通过则返回 FastAPI 用的 X-Admin-Key。 */
export function requireAdmin(req: Request): NextResponse | string {
  const expected = getAdminAccessKey()
  if (!expected) return adminNotConfigured()
  const token = readAdminSessionCookie(req)
  if (!verifyAdminSession(token)) return adminForbidden()
  return expected
}

export async function buildAdminProxyRequest(req: Request, adminKey: string): Promise<Request> {
  const headers = { ...Object.fromEntries(req.headers.entries()), "X-Admin-Key": adminKey }
  if (req.method === "GET" || req.method === "HEAD") {
    return new Request(req.url, { method: req.method, headers })
  }
  return new Request(req.url, {
    method: req.method,
    headers,
    body: await req.text(),
  })
}
