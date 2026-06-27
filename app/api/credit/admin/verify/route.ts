import { NextResponse } from "next/server"

import {
  clientIp,
  issueAdminSession,
  isAdminLoginBlocked,
  recordAdminLoginAttempt,
} from "@/lib/admin-session"
import { isAdminCredentialsConfigured, verifyAdminCredentials } from "@/lib/admin-credentials"
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
  if (!isAdminCredentialsConfigured()) {
    return NextResponse.json(
      { detail: { code: "ADMIN_CREDENTIALS_NOT_CONFIGURED", message: "未配置管理员账号密码" } },
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
  const loginName = typeof body?.login_name === "string" ? body.login_name.trim() : ""
  const password = typeof body?.password === "string" ? body.password : ""
  if (!loginName || !password) {
    return NextResponse.json(
      { detail: { code: "INVALID_INPUT", message: "账号和密码不能为空" } },
      { status: 400 },
    )
  }

  if (!verifyAdminCredentials(loginName, password)) {
    recordAdminLoginAttempt(ip, false)
    return NextResponse.json(
      { detail: { code: "FORBIDDEN", message: "管理员账号或密码错误" } },
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
