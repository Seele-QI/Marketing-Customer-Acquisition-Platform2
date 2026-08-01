export type EnabledBusinessAssistantId = "video-creation" | "geo-growth"
export type ReservedBusinessAssistantId = "douyin-interception"
export type BusinessAssistantId =
  | EnabledBusinessAssistantId
  | ReservedBusinessAssistantId

export type BusinessProjectKind = "video" | "geo"
export type BusinessAssistantAvailability = "enabled" | "reserved"

export type BusinessAssistantDefinition = {
  id: BusinessAssistantId
  agentId: "video-production" | "geo-growth" | "channel-distribution"
  name: string
  shortName: string
  description: string
  projectKind?: BusinessProjectKind
  availability: BusinessAssistantAvailability
  supportedViews: readonly string[]
  workflowStages: readonly string[]
}

export type BusinessProjectStatus =
  | "active"
  | "paused"
  | "completed"
  | "archived"

export type BusinessProjectStepStatus =
  | "pending"
  | "active"
  | "blocked"
  | "completed"

export type BusinessProjectStep = {
  id: string
  projectId: string
  stage: string
  title: string
  status: BusinessProjectStepStatus
  orderIndex: number
  linkedView?: string
  linkedTaskId?: string
  linkedArtifact?: Record<string, unknown>
  blockedReason?: string
  revision: number
  createdAt: number
  updatedAt: number
}

export type BusinessProject = {
  id: string
  kind: BusinessProjectKind
  title: string
  goal: string
  status: BusinessProjectStatus
  currentStage: string
  assistantId: EnabledBusinessAssistantId
  revision: number
  createdAt: number
  updatedAt: number
  steps: BusinessProjectStep[]
}

export type BusinessAssistantMessage = {
  id: string
  projectId: string
  assistantId: EnabledBusinessAssistantId
  role: "user" | "assistant" | "system"
  content: string
  metadata: Record<string, unknown>
  createdAt: number
}

export type BusinessProjectDetail = {
  project: BusinessProject
  messages: BusinessAssistantMessage[]
}

export type AssistantPageContext = {
  activeView?: string
  summary?: string
  projectId?: string
  runtimeTaskId?: string
  runtimeStatus?: string
  fields?: Record<string, string>
  [key: string]: unknown
}

export type BusinessAssistantSuggestedAction =
  | {
      type: "navigate"
      label: string
      view: string
    }
  | {
      type: "update_plan"
      label: string
      steps: Array<{ stage: string; title: string; linkedView?: string }>
    }

export type BusinessAssistantReply = {
  text: string
  suggestedActions: BusinessAssistantSuggestedAction[]
  memoryStatus?: "loaded" | "unavailable"
  billing?: { chargedCredits: number; balance?: number }
  persistenceWarning?: string
}

export type OperationGuideStep = {
  id: string
  title: string
  instruction: string
  completionCriteria: string
  highlightTarget?: string
  linkedView?: string
  completionProbe?: "manual" | "runtime-running" | "runtime-success"
}

export type OperationGuideIssue = {
  problem: string
  solution: string
}

export type OperationGuide = {
  id: string
  assistantId: EnabledBusinessAssistantId
  view: string
  title: string
  purpose: string
  preparation: readonly string[]
  steps: readonly OperationGuideStep[]
  commonIssues: readonly OperationGuideIssue[]
}
