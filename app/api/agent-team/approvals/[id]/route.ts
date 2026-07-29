import { proxyAgentTeamApi } from "@/lib/agents/api-proxy"

export const runtime = "nodejs"
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return proxyAgentTeamApi(request, `/api/agent-team/approvals/${encodeURIComponent(id)}/decision`)
}

