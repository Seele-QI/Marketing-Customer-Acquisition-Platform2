import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { chargeBillingEvent, estimateBillingCost } from "@/lib/api/charge-billing"
import { getCreditBalance, withAuth } from "@/lib/api/with-auth"
import {
  parseAssistantCompletion,
  sanitizeAssistantPageContext,
} from "@/lib/business-assistant/actions"
import { getBusinessAssistant } from "@/lib/business-assistant/registry"
import {
  appendBusinessAssistantMessageServer,
  loadBusinessProjectServer,
} from "@/lib/business-assistant/server"
import type { EnabledBusinessAssistantId } from "@/lib/business-assistant/types"
import {
  completeAgentTurn,
  listAgentProviderCandidates,
} from "@/lib/agents/model-router"
import { buildAgentSystemPrompt } from "@/lib/agents/prompts"
import { retrieveServerMemory } from "@/lib/memory/server"

export const runtime = "nodejs"
export const maxDuration = 120

function stringValue(value: unknown, max: number): string {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, max)
    : ""
}

export const POST = withAuth(async (request, { cookieHeader }) => {
  const raw = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const projectId = stringValue(raw?.projectId, 100)
  const assistantId = stringValue(raw?.assistantId, 80)
  const message = stringValue(raw?.message, 12_000)
  if (!projectId || !assistantId || !message) {
    return NextResponse.json(
      { detail: { code: "INVALID_INPUT", message: "请选择项目并输入问题" } },
      { status: 400 },
    )
  }

  const assistant = getBusinessAssistant(assistantId)
  if (
    !assistant ||
    assistant.availability !== "enabled" ||
    !assistant.projectKind
  ) {
    return NextResponse.json(
      { detail: { code: "ASSISTANT_UNAVAILABLE", message: "该助理暂未开放" } },
      { status: 409 },
    )
  }

  const loaded = await loadBusinessProjectServer({ cookieHeader, projectId })
  if (loaded.status !== "loaded") {
    return NextResponse.json(
      {
        detail: {
          code: loaded.status === "not_found" ? "PROJECT_NOT_FOUND" : "PROJECT_UNAVAILABLE",
          message: loaded.status === "not_found" ? "项目不存在" : "项目服务暂不可用",
        },
      },
      { status: loaded.status === "not_found" ? 404 : 503 },
    )
  }
  const project = loaded.detail.project
  if (
    project.assistantId !== assistant.id ||
    project.kind !== assistant.projectKind
  ) {
    return NextResponse.json(
      { detail: { code: "PROJECT_ASSISTANT_MISMATCH", message: "项目与助理不匹配" } },
      { status: 409 },
    )
  }

  const providers = listAgentProviderCandidates({ hasImages: false })
  if (!providers.length) {
    return NextResponse.json(
      { detail: { code: "MODEL_NOT_CONFIGURED", message: "云端模型配置尚未同步完成" } },
      { status: 503 },
    )
  }
  const estimatedCost = Math.max(
    ...providers.map((provider) =>
      estimateBillingCost("copywriting.llm_call", { modelId: provider.model }),
    ),
  )
  try {
    if ((await getCreditBalance(cookieHeader)) < estimatedCost) {
      return NextResponse.json(
        { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
        { status: 402 },
      )
    }
  } catch {
    // The metered charge remains authoritative; a failed preflight is not success evidence.
  }

  const pageContext = sanitizeAssistantPageContext(raw?.pageContext)
  const memory = await retrieveServerMemory({
    cookieHeader,
    scope: project.kind,
    agentName: assistant.name,
    query: `${project.goal}\n${message}`,
  })
  const plan = project.steps
    .map((step) => `${step.status === "completed" ? "✓" : "○"} ${step.stage}：${step.title}`)
    .join("\n")
  const recentMessages = loaded.detail.messages.slice(-12).map((item) => ({
    role: item.role === "assistant" ? ("assistant" as const) : ("user" as const),
    content: item.content,
  }))
  const system = [
    buildAgentSystemPrompt({
      agentId: assistant.agentId,
      knowledgeContext: memory.context,
    }),
    "# 当前业务项目",
    `项目：${project.title}\n目标：${project.goal}\n当前阶段：${project.currentStage}\n计划：\n${plan || "尚未制定"}`,
    `# 当前页面上下文\n${JSON.stringify(pageContext)}`,
    "# 输出协议",
    "只返回 JSON：{\"text\":\"给用户的专业指导\",\"suggestedActions\":[]}",
    "suggestedActions 仅允许 navigate 或 update_plan。禁止返回 generate、publish、charge、delete 等执行动作。",
    `navigate 的 view 只能取：${assistant.supportedViews.join("、")}`,
    "update_plan 的 steps 每项仅含 stage、title、linkedView；计划必须符合当前项目进度。",
    "当用户要求生成、扣费、发布或对外触达时，只解释下一步并建议导航，不得声称已经执行。",
  ].join("\n\n")

  const completion = await completeAgentTurn({
    providers,
    messages: [
      { role: "system", content: system },
      ...recentMessages,
      { role: "user", content: message },
    ],
    signal: request.signal,
  })
  if (!completion.ok) {
    return NextResponse.json(
      { detail: { code: completion.code, message: "助理暂时无法完成本轮回复" } },
      { status: completion.code === "CANCELLED" ? 499 : 502 },
    )
  }

  const reply = parseAssistantCompletion(
    completion.text,
    assistant.supportedViews,
  )
  const refId = `business-assistant:${projectId}:${crypto.randomBytes(8).toString("hex")}`
  let billing: { chargedCredits: number; balance?: number } = {
    chargedCredits: 0,
  }
  try {
    const charged = await chargeBillingEvent({
      cookieHeader,
      billingKey: "copywriting.llm_call",
      params: { modelId: completion.route.model },
      refId,
    })
    billing = { chargedCredits: charged.cost, balance: charged.balance }
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
        { status: 402 },
      )
    }
  }

  const storedUserMessage = await appendBusinessAssistantMessageServer({
    cookieHeader,
    projectId,
    assistantId: assistant.id as EnabledBusinessAssistantId,
    role: "user",
    content: message,
    metadata: { pageContext },
  })
  const storedAssistantMessage = await appendBusinessAssistantMessageServer({
    cookieHeader,
    projectId,
    assistantId: assistant.id as EnabledBusinessAssistantId,
    role: "assistant",
    content: reply.text,
    metadata: {
      suggestedActions: reply.suggestedActions,
      memoryStatus: memory.status,
      route: completion.route,
      billing,
    },
  })

  return NextResponse.json({
    ...reply,
    memoryStatus: memory.status,
    billing,
    ...(!storedUserMessage || !storedAssistantMessage
      ? { persistenceWarning: "本轮回复已完成，但会话记录保存失败；请先复制结果，稍后重新打开项目再试。" }
      : {}),
  })
})
