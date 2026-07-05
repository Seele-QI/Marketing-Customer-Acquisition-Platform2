import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import {
  fetchHtmlText,
  TianapiHtmlTextError,
} from "@/lib/tianapi-htmltext"

export const runtime = "nodejs"
export const maxDuration = 30

async function handleFetch(req: Request, cookieHeader: string): Promise<Response> {
  try {
    const body = (await req.json()) as { url?: string }
    const url = String(body.url ?? "").trim()
    if (!url) {
      return NextResponse.json({ error: "请提供网页 URL" }, { status: 400 })
    }

    const refId = `geo-authority:${crypto.randomUUID()}`
    try {
      await chargeCredit({ cookieHeader, scene: "geo_authority_link", refId })
    } catch (e) {
      return chargeErrorResponse(e)
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

export async function POST(req: Request) {
  return withAuth(async (innerReq, { cookieHeader }) => handleFetch(innerReq, cookieHeader))(req)
}
