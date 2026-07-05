import { NextResponse } from "next/server"

import {
  fetchHtmlText,
  TianapiHtmlTextError,
} from "@/lib/tianapi-htmltext"

export const runtime = "nodejs"
export const maxDuration = 30

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { url?: string }
    const url = String(body.url ?? "").trim()
    if (!url) {
      return NextResponse.json({ error: "请提供网页 URL" }, { status: 400 })
    }

    const page = await fetchHtmlText(url)
    return NextResponse.json({
      page: {
        url: page.url,
        title: page.title,
        content: page.content,
        picture: page.picture,
        fetchedAt: new Date().toISOString(),
      },
    })
  } catch (err) {
    if (err instanceof TianapiHtmlTextError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: err.statusCode },
      )
    }
    const message = err instanceof Error ? err.message : "抓取失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
