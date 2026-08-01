import { NextResponse } from "next/server"
import { getShareRecord, renderShareLandingPage } from "@/lib/share-store"

export const runtime = "nodejs"

type Params = { params: Promise<{ token: string }> }

export async function GET(_req: Request, { params }: Params) {
  const { token } = await params
  const record = getShareRecord(token)
  if (!record) {
    return NextResponse.json({ detail: "分享链接已过期或不存在" }, { status: 410 })
  }

  const html = renderShareLandingPage(record)
  return new NextResponse(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data: https:; media-src https: http: blob:; base-uri 'none'; frame-ancestors 'none'",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  })
}
