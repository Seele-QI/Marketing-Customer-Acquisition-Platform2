import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { chargeBillingEvent, estimateBillingCost } from "@/lib/api/charge-billing"
import { getCreditBalance, withAuth } from "@/lib/api/with-auth"
import { listAgentProviderCandidates } from "@/lib/agents/model-router"
import { planAgentCollaboration, runAgentCollaboration } from "@/lib/agents/orchestrator"
import { serializePublicAgentRun } from "@/lib/agents/public"
import { sanitizeAgentRunRequest } from "@/lib/agents/run-request"
import {
  appendDurableAgentEvent,
  createDurableAgentRun,
  retrieveAgentKnowledge,
  updateDurableAgentRun,
} from "@/lib/agents/server-store"

export const runtime = "nodejs"
export const maxDuration = 300

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }
  const validated = sanitizeAgentRunRequest(raw)
  if (!validated.ok) {
    return NextResponse.json({ detail: validated.detail }, { status: validated.status })
  }
  const input = validated.value
  const plan = planAgentCollaboration({
    selectedAgentId: input.agentId,
    prompt: input.prompt,
    collaboration: input.collaboration,
  })
  const providers = listAgentProviderCandidates({ hasImages: input.images.length > 0 })
  if (providers.length === 0) {
    return NextResponse.json(
      { detail: { code: "MODEL_NOT_CONFIGURED", message: "云端模型配置尚未同步完成" } },
      { status: 503 },
    )
  }

  const callCount = 1 + plan.cosignerAgentIds.length + (plan.cosignerAgentIds.length > 0 ? 1 : 0)
  const unitCost = Math.max(
    ...providers.map((provider) =>
      estimateBillingCost("copywriting.llm_call", { modelId: provider.model }),
    ),
  )
  const needCredits = unitCost * callCount
  try {
    const balance = await getCreditBalance(cookieHeader)
    if (balance < needCredits) {
      return NextResponse.json(
        { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足", need: needCredits, have: balance } },
        { status: 402 },
      )
    }
  } catch {
    // 最终扣费仍由云端定价与幂等 ref_id 校验，余额探测失败不伪造成功。
  }

  const durable = await createDurableAgentRun({
    cookieHeader,
    agentId: input.agentId,
    prompt: input.prompt,
  })
  const runId =
    durable.status === "created"
      ? durable.run.id
      : `agent-run:${userId}:${crypto.randomBytes(8).toString("hex")}`
  let durableRevision = durable.status === "created" ? durable.run.revision : undefined
  const departmentIds = [plan.primaryAgentId, ...plan.cosignerAgentIds]
  const knowledge = await retrieveAgentKnowledge({
    cookieHeader,
    query: input.prompt,
    runId,
    departmentIds,
  })
  const runtimeWarnings: string[] = []
  if (durable.status === "unavailable") runtimeWarnings.push("运行记录服务暂不可用，本次结果未持久化")
  if (knowledge.status === "unavailable") runtimeWarnings.push("knowledge_unavailable：企业知识库暂不可用")
  if (durableRevision != null) {
    await appendDurableAgentEvent({
      cookieHeader,
      runId,
      eventType: "planned",
      payload: {
        selectedAgentId: input.agentId,
        primaryAgentId: plan.primaryAgentId,
        cosignerAgentIds: plan.cosignerAgentIds,
        attachmentEvidenceCount: input.evidence.length,
        imageCount: input.images.length,
        knowledgeStatus: knowledge.status,
        knowledgeCount: knowledge.items.length,
      },
    })
    const running = await updateDurableAgentRun({
      cookieHeader,
      runId,
      revision: durableRevision,
      status: "running",
    })
    if (running.revision != null) durableRevision = running.revision
  }

  const result = await runAgentCollaboration({
    selectedAgentId: input.agentId,
    prompt: input.prompt,
    collaboration: input.collaboration,
    evidence: [...input.evidence, ...knowledge.items],
    images: input.images,
    signal: request.signal,
  })
  if (result.status === "cancelled") {
    if (durableRevision != null) {
      await updateDurableAgentRun({ cookieHeader, runId, revision: durableRevision, status: "cancelled" })
    }
    return NextResponse.json({ detail: { code: "CANCELLED", message: "任务已取消" } }, { status: 499 })
  }
  if (result.status === "failed") {
    if (durableRevision != null) {
      await updateDurableAgentRun({
        cookieHeader,
        runId,
        revision: durableRevision,
        status: "failed",
        result: { warnings: result.warnings },
      })
    }
    return NextResponse.json(
      { detail: { code: "AGENT_RUN_FAILED", message: "主责任务未完成", warnings: result.warnings } },
      { status: 502 },
    )
  }

  const billingWarnings: string[] = []
  let balance: number | undefined
  let chargedCredits = 0
  for (const [index, route] of result.routeSnapshots.entries()) {
    try {
      const charged = await chargeBillingEvent({
        cookieHeader,
        billingKey: "copywriting.llm_call",
        params: { modelId: route.model },
        refId: `${runId}:${index + 1}`,
      })
      balance = charged.balance
      chargedCredits += charged.cost
    } catch (error) {
      billingWarnings.push(error instanceof Error ? error.message : "CHARGE_FAILED")
    }
  }

  result.warnings.push(...runtimeWarnings)
  if (billingWarnings.length) result.warnings.push("计费记录需要后台对账")
  if (durableRevision != null) {
    const persisted = await updateDurableAgentRun({
      cookieHeader,
      runId,
      revision: durableRevision,
      status: result.status,
      result: {
        plan: result.plan,
        finalText: result.finalText,
        conflicts: result.conflicts,
        warnings: result.warnings,
        activeSkillIds: result.activeSkillIds,
        routeSnapshots: result.routeSnapshots,
        billing: { chargedCredits, warnings: billingWarnings },
      },
    })
    if (persisted.revision == null) result.warnings.push("运行结果持久化失败")
    await appendDurableAgentEvent({
      cookieHeader,
      runId,
      eventType: "result",
      payload: {
        status: result.status,
        activeSkillIds: result.activeSkillIds,
        routeSnapshots: result.routeSnapshots,
        chargedCredits,
        billingStatus: billingWarnings.length === 0 ? "charged" : "needs_reconciliation",
      },
    })
  }

  return NextResponse.json({
    runId,
    result: serializePublicAgentRun(result),
    billing: {
      status: billingWarnings.length === 0 ? "charged" : "needs_reconciliation",
      chargedCredits,
      ...(balance == null ? {} : { balance }),
      warnings: billingWarnings,
    },
  })
})
