import { NextResponse } from "next/server"

import { clientIp, isAdminLoginBlocked } from "@/lib/admin-session"
import { sendAdminPhoneLoginCode } from "@/lib/admin-phone-login"

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

  const result = await sendAdminPhoneLoginCode({ phone, ip })
  if (!result.ok) {
    return NextResponse.json(
      { detail: { code: result.code, message: result.message } },
      { status: result.status },
    )
  }

  return NextResponse.json({
    ok: true,
    masked_phone: result.maskedPhone,
    cooldown_sec: result.cooldownSec,
    ...(result.devCode ? { dev_code: result.devCode } : {}),
  })
}
