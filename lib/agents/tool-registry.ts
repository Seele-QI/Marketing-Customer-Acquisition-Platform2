import { AGENT_DEFINITIONS, getAgentById } from "@/lib/agents/registry"
import type { ToolPermission } from "@/lib/agents/types"

export type ToolAvailability = "available" | "needs_configuration" | "blocked"

export type ToolCapability = {
  id: string
  label: string
  permission: ToolPermission
  availability: ToolAvailability
  reason: string
  approvalRequired: boolean
  availableForExecution: boolean
  supportedAgentIds: string[]
}

const LABELS: Record<string, string> = {
  knowledge_search: "知识库检索",
  document_draft: "文档草拟",
  content_publish: "内容发布",
  publish_content: "内容发布",
  external_send: "对外发送",
  email_send: "邮件发送",
  calendar_write: "日程写入",
  crm_write: "CRM 写入",
  payment: "付款",
  contract_signature: "合同签署",
  employment_decision: "人事决定",
  production_change: "生产变更",
}

const CONFIGURATION_REQUIRED = new Set([
  "external_send",
  "contract_send",
  "employee_notice",
  "customer_notice",
  "official_commitment",
  "binding_commitment",
  "ad_launch",
  "ledger_write",
  "roadmap_write",
  "crm_write",
  "knowledge_promote",
  "email_send",
  "calendar_write",
])

function metadata(id: string, permission: ToolPermission) {
  if (permission === "T3") {
    return {
      availability: "blocked" as const,
      reason: "高风险决策或不可逆操作不允许由智能体执行",
      availableForExecution: false,
    }
  }
  if (CONFIGURATION_REQUIRED.has(id)) {
    return {
      availability: "needs_configuration" as const,
      reason: "尚无已配置并验证的企业连接器",
      availableForExecution: false,
    }
  }
  if (id === "content_publish" || id === "publish_content") {
    return {
      availability: "available" as const,
      reason: "仅在审批通过且平台账号已验证时执行",
      availableForExecution: true,
    }
  }
  return {
    availability: "available" as const,
    reason: permission === "T0" ? "只读或分析能力" : "仅生成内部草稿",
    availableForExecution: permission === "T0" || permission === "T1",
  }
}

function buildRegistry(): ToolCapability[] {
  const declared = new Map<string, { permission: ToolPermission; agents: Set<string> }>()
  for (const agent of AGENT_DEFINITIONS) {
    for (const [id, permission] of Object.entries(agent.toolPermissions)) {
      const current = declared.get(id)
      if (current) current.agents.add(agent.id)
      else declared.set(id, { permission, agents: new Set([agent.id]) })
    }
  }
  for (const [id, permission] of [
    ["publish_content", "T2"],
    ["email_send", "T2"],
    ["calendar_write", "T2"],
  ] as const) {
    if (!declared.has(id)) declared.set(id, { permission, agents: new Set() })
  }
  return [...declared.entries()]
    .map(([id, value]) => {
      const state = metadata(id, value.permission)
      return {
        id,
        label: LABELS[id] ?? id.replace(/_/g, " "),
        permission: value.permission,
        availability: state.availability,
        reason: state.reason,
        approvalRequired: value.permission === "T2",
        availableForExecution: state.availableForExecution,
        supportedAgentIds: [...value.agents],
      }
    })
    .sort((a, b) => a.id.localeCompare(b.id))
}

export const AGENT_TOOL_CAPABILITIES: readonly ToolCapability[] = buildRegistry()

export function getToolCapability(id: string): ToolCapability | undefined {
  return AGENT_TOOL_CAPABILITIES.find((tool) => tool.id === id)
}

export function getAgentToolCapabilities(agentId: string): ToolCapability[] {
  const agent = getAgentById(agentId)
  if (!agent) return []
  return Object.keys(agent.toolPermissions)
    .map(getToolCapability)
    .filter((tool): tool is ToolCapability => Boolean(tool))
}

