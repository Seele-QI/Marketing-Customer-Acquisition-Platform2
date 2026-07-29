import { proxyAgentTeamApi } from "@/lib/agents/api-proxy"

export const runtime = "nodejs"
export function POST(request: Request) {
  return proxyAgentTeamApi(request, "/api/agent-team/knowledge/import")
}

