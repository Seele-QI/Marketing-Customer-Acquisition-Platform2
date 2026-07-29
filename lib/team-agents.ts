import { AGENT_DEFINITIONS, getAgentByName } from "@/lib/agents/registry"
import type { AgentQuickPrompt } from "@/lib/agents/types"

export type TeamAgentQuickPrompt = AgentQuickPrompt
export type TeamAgentStatus = "online" | "working" | "idle"

export type TeamAgent = {
  id: string
  name: string
  role: string
  description: string
  avatar: string
  tags: string[]
  status: TeamAgentStatus
  themeColor: string
  quickPrompts: TeamAgentQuickPrompt[]
  department: string
  level: string
  group: string
  availability: string
  skillIds: string[]
}

export const TEAM_AGENTS: TeamAgent[] = AGENT_DEFINITIONS.map((agent) => ({
  id: agent.id,
  name: agent.name,
  role: `${agent.title} · ${agent.level}`,
  description: agent.description,
  avatar: agent.avatar,
  tags: agent.tags,
  status: agent.availability === "available" ? "online" : "idle",
  themeColor: agent.themeColor,
  quickPrompts: agent.quickPrompts,
  department: agent.department,
  level: agent.level,
  group: agent.group,
  availability: agent.availability,
  skillIds: agent.skillIds,
}))

export function getTeamAgentByName(name: string): TeamAgent | undefined {
  const definition = getAgentByName(name)
  return definition ? TEAM_AGENTS.find((agent) => agent.id === definition.id) : undefined
}
