import { NextResponse } from "next/server"

import {
  clientIp,
  issueAdminSession,
  isAdminLoginBlocked,
  recordAdminLoginAttempt,
} from "@/lib/admin-session"
import { verifyAdminPhoneLoginCode } from "@/lib/admin-phone-login"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const ip = clientIp(req)
  if (isAdminLoginBlocked(ip)) {
    return NextResponse.json(
      { detail: { code: "TOO_MANY_ATTEMPTS", message: "尝试次数过多，请 15 分钟后再试" } },
      { status: 429 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const phone = typeof body?.phone === "string" ? body.phone : ""
  const code = typeof body?.code === "string" ? body.code : ""

  const result = verifyAdminPhoneLoginCode({ phone, code })
  if (!result.ok) {
    if (result.code === "INVALID_CODE" || result.code === "PHONE_NOT_ALLOWED") {
      recordAdminLoginAttempt(ip, false)
    }
    return NextResponse.json(
      { detail: { code: result.code, message: result.message } },
      { status: result.status },
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
