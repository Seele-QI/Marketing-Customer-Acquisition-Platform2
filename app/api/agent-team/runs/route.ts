import { proxyAgentTeamApi } from "@/lib/agents/api-proxy"

export const runtime = "nodejs"
export function GET(request: Request) {
  return proxyAgentTeamApi(request, "/api/agent-team/runs", true)
}

