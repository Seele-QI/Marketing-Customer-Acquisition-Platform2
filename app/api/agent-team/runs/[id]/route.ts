import { proxyAgentTeamApi } from "@/lib/agents/api-proxy"

export const runtime = "nodejs"
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return proxyAgentTeamApi(request, `/api/agent-team/runs/${encodeURIComponent(id)}`)
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return proxyAgentTeamApi(request, `/api/agent-team/runs/${encodeURIComponent(id)}/cancel`, true)
}

