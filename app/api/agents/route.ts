import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { buildPublicAgentCatalog } from "@/lib/agents/public"

export const runtime = "nodejs"

export const GET = withAuth(async () =>
  NextResponse.json({ agents: buildPublicAgentCatalog() }, { status: 200 }),
)

