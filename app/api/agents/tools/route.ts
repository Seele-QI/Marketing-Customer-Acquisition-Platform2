import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { AGENT_TOOL_CAPABILITIES } from "@/lib/agents/tool-registry"

export const runtime = "nodejs"
export const GET = withAuth(async () =>
  NextResponse.json({ tools: AGENT_TOOL_CAPABILITIES }, { status: 200 }),
)

