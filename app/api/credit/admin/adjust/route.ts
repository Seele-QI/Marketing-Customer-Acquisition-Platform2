import { NextResponse } from "next/server"

import { buildAdminProxyRequest, requireAdmin } from "@/lib/admin-route-guard"
import { proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const gate = requireAdmin(req)
  if (gate instanceof NextResponse) return gate
  const upstreamReq = await buildAdminProxyRequest(req, gate)
  return proxyToFastapi(upstreamReq, "/api/credit/admin/adjust")
}
