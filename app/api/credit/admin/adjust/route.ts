import { NextResponse } from "next/server"

import { buildAdminProxyRequest, requireAdmin } from "@/lib/admin-route-guard"
import { proxyToCloudApi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function POST(req: Request) {
  const gate = requireAdmin(req)
  if (gate instanceof NextResponse) return gate
  const upstreamReq = await buildAdminProxyRequest(req, gate)
  return proxyToCloudApi(upstreamReq, "/api/credit/admin/adjust")
}
