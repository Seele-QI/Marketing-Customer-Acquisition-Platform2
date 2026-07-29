import type { AgentAttachment } from "@/lib/agents/attachments"
import { buildReadyAttachmentPayload } from "@/lib/agents/attachments"
import type { AgentTaskTraceStep } from "@/lib/agents/task-trace"

export type PublicAgentMemberResult = {
  agentId: string
  name: string
  title: string
  role: "primary" | "cosigner"
  status: "completed" | "failed" | "cancelled"
  text: string
  error?: string
  activeSkillIds: string[]
}

export type EnterpriseAgentRunResponse = {
  runId: string
  result: {
    status: "completed" | "partial"
    plan: { primaryAgentId: string; cosignerAgentIds: string[]; reason: string }
    primary: PublicAgentMemberResult
    cosigners: PublicAgentMemberResult[]
    finalText: string
    conflicts: string[]
    activeSkillIds: string[]
    warnings: string[]
    trace: AgentTaskTraceStep[]
    modelRouting: { source: "server"; successfulCalls: number }
  }
  billing: {
    status: "charged" | "needs_reconciliation"
    chargedCredits: number
    balance?: number
    warnings: string[]
  }
}

export type EnterpriseAgentPlanResponse = {
  plan: { primaryAgentId: string; cosignerAgentIds: string[]; reason: string }
  trace: AgentTaskTraceStep[]
  modelRouting: { source: "server"; family: "DeepSeek"; tier: "fast" }
}

export type EnterpriseAgentRunHistory = {
  id: string
  agent_id: string
  prompt: string
  status: string
  updated_at: number
  result: {
    finalText?: string
    warnings?: string[]
    modelRouting?: { source: "server"; successfulCalls: number }
  }
}

async function detailFrom(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
  if (typeof body.detail === "string") return body.detail
  if (body.detail && typeof body.detail === "object") {
    const detail = body.detail as Record<string, unknown>
    if (typeof detail.message === "string") return detail.message
  }
  return `请求失败（${response.status}）`
}

export async function runEnterpriseAgent(input: {
  agentId: string
  prompt: string
  collaboration: boolean
  attachments: readonly AgentAttachment[]
  signal?: AbortSignal
}): Promise<EnterpriseAgentRunResponse> {
  const payload = buildReadyAttachmentPayload(input.attachments)
  const response = await fetch("/api/agents/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      agentId: input.agentId,
      prompt: input.prompt,
      collaboration: input.collaboration,
      evidence: payload.evidence,
      images: payload.images,
    }),
    signal: input.signal,
  })
  if (!response.ok) throw new Error(await detailFrom(response))
  return (await response.json()) as EnterpriseAgentRunResponse
}

export async function planEnterpriseAgentTask(input: {
  agentId: string
  prompt: string
  collaboration: boolean
  signal?: AbortSignal
}): Promise<EnterpriseAgentPlanResponse> {
  const response = await fetch("/api/agents/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: input.signal,
  })
  if (!response.ok) throw new Error(await detailFrom(response))
  return (await response.json()) as EnterpriseAgentPlanResponse
}

export async function promoteAgentKnowledge(input: {
  attachment: AgentAttachment
  departmentId: string
  taskId?: string
}): Promise<void> {
  if (input.attachment.kind !== "document" || !input.attachment.extractedText) return
  if (input.attachment.scope === "temporary") return
  const response = await fetch("/api/agent-team/knowledge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      scope: input.attachment.scope,
      departmentId: input.attachment.scope === "department" ? input.departmentId : undefined,
      name: input.attachment.name,
      text: input.attachment.extractedText,
      sourceType: "upload",
    }),
  })
  if (!response.ok) throw new Error(await detailFrom(response))
}

export async function listEnterpriseAgentRuns(): Promise<EnterpriseAgentRunHistory[]> {
  const response = await fetch("/api/agent-team/runs?limit=30", { cache: "no-store" })
  if (!response.ok) return []
  const body = (await response.json()) as { runs?: EnterpriseAgentRunHistory[] }
  return Array.isArray(body.runs) ? body.runs : []
}
