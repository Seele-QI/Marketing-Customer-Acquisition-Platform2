import { NextResponse } from "next/server"

import {
  clientIp,
  issueAdminSession,
  isAdminLoginBlocked,
  recordAdminLoginAttempt,
  timingSafeEq,
} from "@/lib/admin-session"
import { getAdminAccessKey } from "@/lib/server-env"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const expected = getAdminAccessKey()
  if (!expected) {
    return NextResponse.json(
      { detail: { code: "ADMIN_KEY_NOT_CONFIGURED", message: "未配置后台访问密钥" } },
      { status: 503 },
    )
  }

  const ip = clientIp(req)
  if (isAdminLoginBlocked(ip)) {
    return NextResponse.json(
      { detail: { code: "TOO_MANY_ATTEMPTS", message: "尝试次数过多，请 15 分钟后再试" } },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const key = typeof body?.access_key === "string" ? body.access_key.trim() : ""
  if (!key) {
    return NextResponse.json(
      { detail: { code: "INVALID_INPUT", message: "access_key 不能为空" } },
      { status: 400 },
    )
  }

  if (!timingSafeEq(key, expected)) {
    recordAdminLoginAttempt(ip, false)
    return NextResponse.json(
      { detail: { code: "FORBIDDEN", message: "后台访问密钥错误" } },
      { status: 403 },
    )
  }

  recordAdminLoginAttempt(ip, true)
  const sessionToken = issueAdminSession({ ip })
  const isProd = process.env.NODE_ENV === "production"

  const res = NextResponse.json({ ok: true })
  res.cookies.set("admin_session", sessionToken, {
    httpOnly: true,
    sameSite: "strict",
    secure: isProd,
    path: "/",
    maxAge: 60 * 60 * 12,
  })
  return res
}
