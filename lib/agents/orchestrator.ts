import { completeAgentTurn, type AgentCompletionResult } from "@/lib/agents/model-router"
import { buildAgentSystemPrompt, buildEvidenceBlock, type EvidenceItem } from "@/lib/agents/prompts"
import { getAgentById } from "@/lib/agents/registry"
import type { AgentRunStatus, ModelRouteSnapshot } from "@/lib/agents/types"
import type { CopywritingChatMessage, CopywritingContentPart } from "@/lib/llm/copywriting-router"

export type CollaborationPlan = {
  primaryAgentId: string
  cosignerAgentIds: string[]
  reason: string
}

export type AgentMemberResult = {
  agentId: string
  name: string
  title: string
  role: "primary" | "cosigner"
  status: "completed" | "failed" | "cancelled"
  text: string
  error?: string
  route?: ModelRouteSnapshot
  activeSkillIds: string[]
}

export type AgentRunResult = {
  status: Extract<AgentRunStatus, "completed" | "partial" | "failed" | "cancelled">
  plan: CollaborationPlan
  primary: AgentMemberResult
  cosigners: AgentMemberResult[]
  finalText: string
  conflicts: string[]
  routeSnapshots: ModelRouteSnapshot[]
  activeSkillIds: string[]
  warnings: string[]
}

type CompletionInput = {
  messages: CopywritingChatMessage[]
  hasImages?: boolean
  signal: AbortSignal
}

export type AgentCompleter = (input: CompletionInput) => Promise<AgentCompletionResult>

export type AgentImageEvidence = {
  mimeType: string
  dataBase64: string
  source: string
}

const DOMAIN_RULES: Array<{ agentId: string; pattern: RegExp }> = [
  { agentId: "strategy-management", pattern: /战略|决策|评估|合作|项目组合|优先级|商业模式/i },
  { agentId: "finance-control", pattern: /预算|财务|现金流|成本|利润|回款|发票|对账|报价金额/i },
  { agentId: "legal-compliance", pattern: /合同|法务|法律|合规|隐私|个人信息|数据使用|知识产权|侵权|条款/i },
  { agentId: "people-operations", pattern: /招聘|岗位|绩效|员工|薪酬|人事|组织设计|面试/i },
  { agentId: "product-management", pattern: /产品|需求|PRD|路线图|用户研究|验收标准|功能设计/i },
  { agentId: "technology-data", pattern: /技术|代码|架构|接口|API|数据分析|日志|故障|安全|数据库|SQL/i },
  { agentId: "brand-marketing", pattern: /品牌|营销|市场|投放|活动|增长|受众|定位|传播/i },
  { agentId: "sales-business", pattern: /销售|客户|商机|成交|谈判|报价|异议|商务方案/i },
  { agentId: "public-affairs", pattern: /媒体|政府|公共事务|舆情|合作伙伴|外联|对外口径/i },
  { agentId: "operations-service", pattern: /运营|交付|SOP|工单|客户成功|服务质量|SLA/i },
  { agentId: "content-strategy", pattern: /选题|内容矩阵|口播文案|文案|脚本|钩子|CTA/i },
  { agentId: "video-production", pattern: /视频|分镜|数字人|剪辑|字幕|音频|BGM|成片/i },
  { agentId: "geo-growth", pattern: /GEO|生成式搜索|实体|查询簇|知识库覆盖|可见度/i },
  { agentId: "channel-distribution", pattern: /分发|发布|抖音|小红书|快手|视频号|账号状态|平台适配/i },
]

function detectedDomains(prompt: string): string[] {
  return DOMAIN_RULES.filter((rule) => rule.pattern.test(prompt)).map((rule) => rule.agentId)
}

export function planAgentCollaboration(input: {
  selectedAgentId: string
  prompt: string
  collaboration?: boolean
}): CollaborationPlan {
  const selected = getAgentById(input.selectedAgentId)
  if (!selected) throw new Error(`UNKNOWN_AGENT:${input.selectedAgentId}`)
  const detected = detectedDomains(input.prompt)
  const primaryAgentId =
    selected.kind === "coordinator" ? detected[0] ?? "strategy-management" : selected.id
  const cosignerAgentIds =
    input.collaboration === false
      ? []
      : detected.filter((agentId) => agentId !== primaryAgentId).slice(0, 3)
  return {
    primaryAgentId,
    cosignerAgentIds,
    reason:
      selected.kind === "coordinator"
        ? `总协调官根据任务内容确定 ${getAgentById(primaryAgentId)?.department ?? primaryAgentId} 主责`
        : `用户直接选择 ${selected.department} 主责`,
  }
}

function memberPrompt(input: {
  prompt: string
  role: "primary" | "cosigner"
  evidence: readonly EvidenceItem[]
  images: readonly AgentImageEvidence[]
}): string {
  return [
    input.role === "primary"
      ? "你是本任务主责部门，请形成完整专业工作底稿。"
      : "你是本任务会签部门，只回答本部门相关风险、依据、阻断项和建议。",
    `用户任务：${input.prompt}`,
    buildEvidenceBlock(input.evidence),
  ]
    .filter(Boolean)
    .join("\n\n")
}

async function runMember(input: {
  agentId: string
  role: "primary" | "cosigner"
  prompt: string
  evidence: readonly EvidenceItem[]
  images: readonly AgentImageEvidence[]
  signal: AbortSignal
  complete: AgentCompleter
}): Promise<AgentMemberResult> {
  const agent = getAgentById(input.agentId)
  if (!agent) throw new Error(`UNKNOWN_AGENT:${input.agentId}`)
  const text = memberPrompt({ prompt: input.prompt, role: input.role, evidence: input.evidence, images: input.images })
  const userContent: string | CopywritingContentPart[] = input.images.length
    ? [
        { type: "text", text },
        ...input.images.map((image) => ({
          type: "image_url" as const,
          image_url: { url: `data:${image.mimeType};base64,${image.dataBase64}` },
        })),
      ]
    : text
  const completion = await input.complete({
    messages: [
      {
        role: "system",
        content: buildAgentSystemPrompt({ agentId: agent.id, activeSkillIds: agent.skillIds }),
      },
      {
        role: "user",
        content: userContent,
      },
    ],
    hasImages: input.images.length > 0,
    signal: input.signal,
  })
  if (!completion.ok) {
    return {
      agentId: agent.id,
      name: agent.name,
      title: agent.title,
      role: input.role,
      status: completion.code === "CANCELLED" ? "cancelled" : "failed",
      text: "",
      error: completion.code,
      activeSkillIds: [...agent.skillIds],
    }
  }
  return {
    agentId: agent.id,
    name: agent.name,
    title: agent.title,
    role: input.role,
    status: "completed",
    text: completion.text,
    route: completion.route,
    activeSkillIds: [...agent.skillIds],
  }
}

function collectConflicts(members: readonly AgentMemberResult[]): string[] {
  const lines: string[] = []
  for (const member of members) {
    if (member.status !== "completed") continue
    for (const line of member.text.split(/\r?\n/)) {
      if (/不同意|冲突|反对|阻断项|不可接受|必须停止/.test(line)) {
        lines.push(`${member.name}：${line.trim()}`)
      }
    }
  }
  return lines.slice(0, 12)
}

function fallbackCombinedText(primary: AgentMemberResult, cosigners: readonly AgentMemberResult[]): string {
  const completed = cosigners.filter((member) => member.status === "completed")
  return [
    primary.text,
    ...completed.map((member) => `\n\n## ${member.name}会签意见\n${member.text}`),
  ].join("")
}

export async function runAgentCollaboration(input: {
  selectedAgentId: string
  prompt: string
  collaboration?: boolean
  evidence?: readonly EvidenceItem[]
  images?: readonly AgentImageEvidence[]
  signal: AbortSignal
  complete?: AgentCompleter
}): Promise<AgentRunResult> {
  const plan = planAgentCollaboration(input)
  const complete: AgentCompleter = input.complete ?? ((args) => completeAgentTurn(args))
  const evidence = input.evidence ?? []
  const images = input.images ?? []
  const memberInputs = [
    { agentId: plan.primaryAgentId, role: "primary" as const },
    ...plan.cosignerAgentIds.map((agentId) => ({ agentId, role: "cosigner" as const })),
  ]
  const settledMembers = await Promise.allSettled(
    memberInputs.map((member) =>
      runMember({
        ...member,
        prompt: input.prompt,
        evidence,
        images,
        signal: input.signal,
        complete,
      }),
    ),
  )
  const members: AgentMemberResult[] = settledMembers.map((settled, index) => {
    if (settled.status === "fulfilled") return settled.value
    const member = memberInputs[index]
    const definition = member ? getAgentById(member.agentId) : undefined
    if (!member || !definition) throw new Error("AGENT_PLAN_CORRUPTED")
    const cancelled = input.signal.aborted
    return {
      agentId: definition.id,
      name: definition.name,
      title: definition.title,
      role: member.role,
      status: cancelled ? "cancelled" : "failed",
      text: "",
      error: cancelled ? "CANCELLED" : "INTERNAL_AGENT_ERROR",
      activeSkillIds: [...definition.skillIds],
    }
  })
  const primary = members[0]
  const cosigners = members.slice(1)
  if (!primary) throw new Error("PRIMARY_AGENT_MISSING")

  const warnings = cosigners
    .filter((member) => member.status !== "completed")
    .map((member) => `${member.name}会签未完成：${member.error ?? member.status}`)
  const conflicts = collectConflicts(cosigners)
  const completedMembers = members.filter((member) => member.status === "completed")
  const routeSnapshots = completedMembers.flatMap((member) => (member.route ? [member.route] : []))
  const activeSkillIds = [...new Set(members.flatMap((member) => member.activeSkillIds))]

  if (input.signal.aborted || primary.status === "cancelled") {
    return {
      status: "cancelled",
      plan,
      primary,
      cosigners,
      finalText: primary.text,
      conflicts,
      routeSnapshots,
      activeSkillIds,
      warnings,
    }
  }
  if (primary.status !== "completed") {
    return {
      status: "failed",
      plan,
      primary,
      cosigners,
      finalText: "",
      conflicts,
      routeSnapshots,
      activeSkillIds,
      warnings: [`${primary.name}主责任务未完成：${primary.error ?? primary.status}`, ...warnings],
    }
  }

  let finalText = fallbackCombinedText(primary, cosigners)
  let synthesisFailed = false
  if (completedMembers.length > 1) {
    const synthesisEvidence: EvidenceItem[] = completedMembers.map((member) => ({
      source: `${member.name}（${member.role === "primary" ? "主责" : "会签"}）`,
      text: member.text,
    }))
    try {
      const synthesis = await complete({
        messages: [
          {
            role: "system",
            content: buildAgentSystemPrompt({ agentId: "chief-coordinator" }),
          },
          {
            role: "user",
            content: [
              `请汇总任务“${input.prompt}”的主责和会签结果。保留真实分歧，不得声称未完成步骤成功。`,
              buildEvidenceBlock(synthesisEvidence),
            ].join("\n\n"),
          },
        ],
        signal: input.signal,
      })
      if (synthesis.ok) {
        finalText = synthesis.text
        routeSnapshots.push(synthesis.route)
      } else {
        synthesisFailed = true
        warnings.push(`总协调汇总未完成：${synthesis.code}`)
      }
    } catch {
      synthesisFailed = true
      warnings.push("总协调汇总未完成：INTERNAL_AGENT_ERROR")
    }
  }

  const hasFailedCosigner = cosigners.some((member) => member.status !== "completed")
  return {
    status: hasFailedCosigner || synthesisFailed ? "partial" : "completed",
    plan,
    primary,
    cosigners,
    finalText,
    conflicts,
    routeSnapshots,
    activeSkillIds,
    warnings,
  }
}
