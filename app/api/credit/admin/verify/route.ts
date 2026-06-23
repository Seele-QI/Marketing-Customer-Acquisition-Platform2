import { NextResponse } from "next/server"

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

  const body = await req.json().catch(() => ({}))
  const key = typeof body?.access_key === "string" ? body.access_key.trim() : ""
  if (!key) {
    return NextResponse.json(
      { detail: { code: "INVALID_INPUT", message: "access_key 不能为空" } },
      { status: 400 },
    )
  }

  if (key !== expected) {
    return NextResponse.json(
      { detail: { code: "FORBIDDEN", message: "后台访问密钥错误" } },
      { status: 403 },
    )
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set("credit_admin_key", key, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 60 * 60 * 12,
  })
  return res
}
