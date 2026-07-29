export type AgentKind = "coordinator" | "department" | "industry_expert"
export type AgentLevel = "O4" | "P3" | "P4"
export type AgentAvailability =
  | "available"
  | "needs_configuration"
  | "unavailable"
  | "paused"
export type AgentGroup =
  | "coordination"
  | "governance"
  | "product_technology"
  | "market_growth"
  | "delivery"
  | "industry"
export type ToolPermission = "T0" | "T1" | "T2" | "T3"

export type AgentQuickPrompt = {
  text: string
  iconKey: string
}

export type AgentDefinition = {
  id: string
  version: string
  name: string
  title: string
  department: string
  group: AgentGroup
  kind: AgentKind
  level: AgentLevel
  description: string
  avatar: string
  themeColor: string
  availability: AgentAvailability
  tags: string[]
  quickPrompts: AgentQuickPrompt[]
  skillIds: string[]
  knowledgeScopes: string[]
  toolPermissions: Record<string, ToolPermission>
  languageStyle: string[]
  outputContract: string[]
  prohibitedActions: string[]
}

export type AgentRunStatus =
  | "queued"
  | "preparing"
  | "running"
  | "needs_review"
  | "partial"
  | "completed"
  | "failed"
  | "cancelled"

export type AgentMemberRole = "primary" | "cosigner" | "coordinator"

export type ModelRouteSnapshot = {
  source: "cloud" | "env"
  providerName: string
  model: string
  selectedAt: number
  failuresBeforeSelection: number
}

