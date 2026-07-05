import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { runGeoResearch } from "@/lib/geo/retrieval/orchestrator"
import type { PlatformId } from "@/lib/geo/retrieval/types"

const VALID_PLATFORMS = new Set<PlatformId>(["zhihu", "xiaohongshu", "tieba", "trends"])

async function handleResearch(req: Request, cookieHeader: string): Promise<Response> {
  try {
    const body = (await req.json()) as {
      keyword?: string
      platforms?: string[]
      urls?: string[]
    }

    const keyword = String(body.keyword ?? "").trim()
    const platforms = (body.platforms ?? [])
      .filter((p): p is PlatformId => VALID_PLATFORMS.has(p as PlatformId)) as PlatformId[]
    const urls = Array.isArray(body.urls) ? body.urls.map((u) => String(u).trim()).filter(Boolean) : []

    if (!keyword && urls.length === 0) {
      return NextResponse.json({ error: "请提供关键词或参考 URL" }, { status: 400 })
    }

    const refId = `geo-research:${crypto.randomUUID()}`
    try {
      await chargeCredit({ cookieHeader, scene: "geo_research", refId })
    } catch (e) {
      return chargeErrorResponse(e)
    }

    const data = await runGeoResearch({ keyword, platforms, urls })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "检索失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return withAuth(async (innerReq, { cookieHeader }) => handleResearch(innerReq, cookieHeader))(req)
}
