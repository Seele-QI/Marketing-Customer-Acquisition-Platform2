import type {
  AgentMemberResult,
  AgentRunResult,
  CollaborationPlan,
} from "@/lib/agents/orchestrator"
import { getAgentById } from "@/lib/agents/registry"

export type AgentTaskTraceStatus =
  | "queued"
  | "active"
  | "completed"
  | "failed"
  | "skipped"

export type AgentTaskTraceStep = {
  id: string
  kind: "intake" | "routing" | "member" | "synthesis" | "finalize"
  label: string
  detail: string
  status: AgentTaskTraceStatus
  agentId?: string
}

function agentLabel(agentId: string): string {
  const agent = getAgentById(agentId)
  return agent ? `${agent.name} · ${agent.department}` : agentId
}

function memberStep(
  member: Pick<AgentMemberResult, "agentId" | "name" | "role" | "status" | "error">,
): AgentTaskTraceStep {
  const definition = getAgentById(member.agentId)
  const status: AgentTaskTraceStatus =
    member.status === "completed" ? "completed" : "failed"
  return {
    id: `member:${member.role}:${member.agentId}`,
    kind: "member",
    label: `${member.role === "primary" ? "主责办理" : "并行会签"} · ${member.name}`,
    detail:
      status === "completed"
        ? `${definition?.department ?? member.agentId}已提交可复核意见`
        : `${definition?.department ?? member.agentId}未完成：${member.error ?? member.status}`,
    status,
    agentId: member.agentId,
  }
}

export function buildPlannedAgentTrace(plan: CollaborationPlan): AgentTaskTraceStep[] {
  const steps: AgentTaskTraceStep[] = [
    {
      id: "intake",
      kind: "intake",
      label: "读取任务与附件",
      detail: "已建立本次任务的证据边界",
      status: "completed",
    },
    {
      id: "routing",
      kind: "routing",
      label: "总协调官完成分诊",
      detail: `${agentLabel(plan.primaryAgentId)}主责`,
      status: "completed",
    },
    {
      id: `member:primary:${plan.primaryAgentId}`,
      kind: "member",
      label: `主责办理 · ${getAgentById(plan.primaryAgentId)?.name ?? plan.primaryAgentId}`,
      detail: `${getAgentById(plan.primaryAgentId)?.department ?? plan.primaryAgentId}正在形成专业工作底稿`,
      status: "active",
      agentId: plan.primaryAgentId,
    },
  ]
  if (plan.cosignerAgentIds.length) {
    for (const agentId of plan.cosignerAgentIds) {
      const agent = getAgentById(agentId)
      steps.push({
        id: `member:cosigner:${agentId}`,
        kind: "member",
        label: `并行会签 · ${agent?.name ?? agentId}`,
        detail: `${agent?.department ?? agentId}正在复核本部门风险与依据`,
        status: "active",
        agentId,
      })
    }
  } else {
    steps.push({
      id: "cosign:none",
      kind: "member",
      label: "无需跨部门会签",
      detail: "本任务可由主责部门独立完成",
      status: "skipped",
    })
  }
  steps.push(
    {
      id: "synthesis",
      kind: "synthesis",
      label: "总协调官汇总",
      detail: plan.cosignerAgentIds.length ? "等待主责与会签意见汇入" : "单部门任务无需联合汇总",
      status: plan.cosignerAgentIds.length ? "queued" : "skipped",
    },
    {
      id: "finalize",
      kind: "finalize",
      label: "形成可复核结论",
      detail: "等待专业办理完成",
      status: "queued",
    },
  )
  return steps
}

export function buildCompletedAgentTrace(result: AgentRunResult): AgentTaskTraceStep[] {
  const synthesisFailed = result.warnings.some((warning) =>
    warning.includes("总协调汇总未完成"),
  )
  const steps: AgentTaskTraceStep[] = [
    {
      id: "intake",
      kind: "intake",
      label: "读取任务与附件",
      detail: "任务材料已按不可信证据边界完成读取",
      status: "completed",
    },
    {
      id: "routing",
      kind: "routing",
      label: "总协调官完成分诊",
      detail: `${agentLabel(result.plan.primaryAgentId)}主责`,
      status: "completed",
    },
    memberStep(result.primary),
  ]
  if (result.cosigners.length) {
    steps.push(...result.cosigners.map(memberStep))
  } else {
    steps.push({
      id: "cosign:none",
      kind: "member",
      label: "无需跨部门会签",
      detail: "本任务由主责部门独立完成",
      status: "skipped",
    })
  }
  steps.push({
    id: "synthesis",
    kind: "synthesis",
    label: "总协调官汇总",
    detail: result.cosigners.length
      ? synthesisFailed
        ? "联合汇总未完成，已保留各部门原始意见"
        : "主责与会签意见已汇总，真实分歧继续保留"
      : "单部门任务无需联合汇总",
    status: result.cosigners.length
      ? synthesisFailed
        ? "failed"
        : "completed"
      : "skipped",
  })
  steps.push({
    id: "finalize",
    kind: "finalize",
    label: "形成可复核结论",
    detail:
      result.status === "completed"
        ? "任务已完成"
        : result.status === "partial"
          ? "任务部分完成，未完成节点已明确标注"
          : result.status === "cancelled"
            ? "任务已停止"
            : "主责任务未形成可用结论",
    status:
      result.status === "completed" || result.status === "partial"
        ? "completed"
        : "failed",
  })
  return steps
}

