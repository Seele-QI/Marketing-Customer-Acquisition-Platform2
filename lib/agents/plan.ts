import { planAgentCollaboration } from "@/lib/agents/orchestrator"
import { sanitizeAgentRunRequest } from "@/lib/agents/run-request"
import {
  buildPlannedAgentTrace,
  type AgentTaskTraceStep,
} from "@/lib/agents/task-trace"

export type PublicAgentPlan = {
  plan: ReturnType<typeof planAgentCollaboration>
  trace: AgentTaskTraceStep[]
  modelRouting: {
    source: "server"
    family: "DeepSeek"
    tier: "fast"
  }
}

export function buildPublicAgentPlan(
  raw: unknown,
):
  | { ok: true; value: PublicAgentPlan }
  | { ok: false; status: 400; detail: string } {
  const validated = sanitizeAgentRunRequest(raw)
  if (!validated.ok) return validated
  const plan = planAgentCollaboration({
    selectedAgentId: validated.value.agentId,
    prompt: validated.value.prompt,
    collaboration: validated.value.collaboration,
  })
  return {
    ok: true,
    value: {
      plan,
      trace: buildPlannedAgentTrace(plan),
      modelRouting: {
        source: "server",
        family: "DeepSeek",
        tier: "fast",
      },
    },
  }
}

