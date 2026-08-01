import { AGENT_DEFINITIONS } from "@/lib/agents/registry"
import { getSkillCatalogForAgent } from "@/lib/agents/skills"
import type { AgentRunResult } from "@/lib/agents/orchestrator"
import { buildCompletedAgentTrace } from "@/lib/agents/task-trace"
import { getAgentToolCapabilities } from "@/lib/agents/tool-registry"

export type PublicAgentDefinition = {
  id: string
  version: string
  name: string
  title: string
  department: string
  group: string
  kind: string
  level: string
  description: string
  avatar: string
  themeColor: string
  availability: string
  tags: string[]
  quickPrompts: Array<{ text: string; iconKey: string }>
  skills: Array<{
    id: string
    version: string
    name: string
    description: string
    riskLevel: string
    sourceType: string
    sourceLinks: string[]
  }>
  tools: Array<{
    id: string
    label: string
    permission: string
    availability: string
    approvalRequired: boolean
    reason: string
  }>
  languageStyle: string[]
  outputContract: string[]
}

export function buildPublicAgentCatalog(): PublicAgentDefinition[] {
  return AGENT_DEFINITIONS.map((agent) => ({
    id: agent.id,
    version: agent.version,
    name: agent.name,
    title: agent.title,
    department: agent.department,
    group: agent.group,
    kind: agent.kind,
    level: agent.level,
    description: agent.description,
    avatar: agent.avatar,
    themeColor: agent.themeColor,
    availability: agent.availability,
    tags: [...agent.tags],
    quickPrompts: agent.quickPrompts.map((item) => ({ ...item })),
    skills: getSkillCatalogForAgent(agent.id).map((skill) => ({
      id: skill.id,
      version: skill.version,
      name: skill.name,
      description: skill.description,
      riskLevel: skill.riskLevel,
      sourceType: skill.sourceType,
      sourceLinks: [...skill.sourceLinks],
    })),
    tools: getAgentToolCapabilities(agent.id).map((tool) => ({
      id: tool.id,
      label: tool.label,
      permission: tool.permission,
      availability: tool.availability,
      approvalRequired: tool.approvalRequired,
      reason: tool.reason,
    })),
    languageStyle: [...agent.languageStyle],
    outputContract: [...agent.outputContract],
  }))
}

function publicMember(member: AgentRunResult["primary"]) {
  return {
    agentId: member.agentId,
    name: member.name,
    title: member.title,
    role: member.role,
    status: member.status,
    text: member.text,
    ...(member.error ? { error: member.error } : {}),
    activeSkillIds: member.activeSkillIds,
  }
}

export function serializePublicAgentRun(result: AgentRunResult) {
  return {
    status: result.status,
    plan: result.plan,
    primary: publicMember(result.primary),
    cosigners: result.cosigners.map(publicMember),
    finalText: result.finalText,
    conflicts: result.conflicts,
    activeSkillIds: result.activeSkillIds,
    warnings: result.warnings,
    trace: buildCompletedAgentTrace(result),
    modelRouting: { source: "server" as const, successfulCalls: result.routeSnapshots.length },
  }
}
