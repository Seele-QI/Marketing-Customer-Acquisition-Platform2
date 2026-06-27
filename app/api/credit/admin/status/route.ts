import { NextResponse } from "next/server"

import { readAdminSessionCookie, verifyAdminSession } from "@/lib/admin-session"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const token = readAdminSessionCookie(req)
  if (!verifyAdminSession(token)) {
    return NextResponse.json(
      { ok: false, detail: { code: "NOT_AUTHENTICATED", message: "未登录管理员" } },
      { status: 401 },
    )
  }
  return NextResponse.json({ ok: true })
}
