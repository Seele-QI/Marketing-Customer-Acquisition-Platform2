/**
 * GET /api/central/manifest — 桌面强更策略（与 FastAPI main.py 语义对齐）
 *
 * 当云端 api 精简镜像未带 /api/central/manifest 时，可由 cloud-web（本 Next）补齐。
 * 环境变量：CENTRAL_LATEST_VERSION / CENTRAL_FORCE_UPDATE_BELOW /
 * CENTRAL_UPDATE_URL / CENTRAL_RELEASE_NOTES
 */

import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function verTuple(v: string): number[] {
  try {
    return v.split(".").map((x) => {
      const n = parseInt(x, 10)
      return Number.isFinite(n) ? n : 0
    })
  } catch {
    return [0]
  }
}

function verLess(a: string, b: string): boolean {
  const ta = verTuple(a)
  const tb = verTuple(b)
  const len = Math.max(ta.length, tb.length)
  for (let i = 0; i < len; i++) {
    const x = ta[i] ?? 0
    const y = tb[i] ?? 0
    if (x < y) return true
    if (x > y) return false
  }
  return false
}

export async function GET(req: NextRequest) {
  const clientVersion =
    req.nextUrl.searchParams.get("client_version")?.trim() || "0.0.0"
  const latest = (process.env.CENTRAL_LATEST_VERSION || "0.1.0").trim()
  const minVer = (process.env.CENTRAL_FORCE_UPDATE_BELOW || "0.0.1").trim()
  const updateUrl = (process.env.CENTRAL_UPDATE_URL || "").trim()
  const releaseNotes = (process.env.CENTRAL_RELEASE_NOTES || "").trim()
  const force = verLess(clientVersion, minVer)

  return NextResponse.json({
    latest_version: latest,
    min_supported_version: minVer,
    update_url: updateUrl,
    force_update: force,
    release_notes: releaseNotes,
  })
}
