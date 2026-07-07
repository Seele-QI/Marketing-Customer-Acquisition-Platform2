import { NextResponse } from "next/server"

import { buildAdminProxyRequest, requireAdmin } from "@/lib/admin-route-guard"
import { fastapiPathWithQuery, proxyToFastapi } from "@/lib/fastapi-base"

export const runtime = "nodejs"

export async function GET(req: Request) {
  const gate = requireAdmin(req)
  if (gate instanceof NextResponse) return gate
  const upstreamReq = await buildAdminProxyRequest(req, gate)
  return proxyToFastapi(upstreamReq, fastapiPathWithQuery(req, "/api/credit/admin/users"))
}
