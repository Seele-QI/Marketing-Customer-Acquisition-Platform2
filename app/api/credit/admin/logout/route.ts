import { NextResponse } from "next/server"

import { readAdminSessionCookie, revokeAdminSession } from "@/lib/admin-session"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const token = readAdminSessionCookie(req)
  revokeAdminSession(token)
  const res = NextResponse.json({ ok: true })
  res.cookies.set("admin_session", "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  })
  return res
}
