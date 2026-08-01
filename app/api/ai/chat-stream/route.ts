import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { chargeBillingEvent, estimateBillingCost } from "@/lib/api/charge-billing"
import { getCreditBalance, withAuth } from "@/lib/api/with-auth"
import {
  connectCopywritingStream,
  listCopywritingProviderCandidates,
  type CopywritingChatMessage,
  type CopywritingContentPart,
  type CopywritingProviderFailure,
} from "@/lib/llm/copywriting-router"
import { retrieveServerMemory, type MemoryRetrievalResult } from "@/lib/memory/server"
import { buildCopywritingEnrichedSystemPrompt } from "@/lib/prompts/copywriting-agent-systems"
import { getWorkflowKnowledgeForAgent } from "@/lib/prompts/copywriting-workflow-knowledge"
import { readServerEnv } from "@/lib/server-env"

export const runtime = "nodejs"
export const maxDuration = 300

const MAX_IMAGE_ATTACHMENTS = 6
const MAX_BASE64_CHARS_PER_IMAGE = 28_000_000
const MAX_CONVERSATION_HISTORY_MESSAGES = 40
const MAX_CHARS_PER_HISTORY_MESSAGE = 24_000

type SanitizedTurn = { role: "user" | "assistant"; content: string }
type IncomingImage = { mimeType?: string; dataBase64?: string }

function sanitizeConversationHistory(raw: unknown): SanitizedTurn[] {
  if (!Array.isArray(raw)) return []
  const out: SanitizedTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const record = item as Record<string, unknown>
    if (record.role !== "user" && record.role !== "assistant") continue
    const role = record.role
    const content = typeof record.content === "string" ? record.content : ""
    if (role === "assistant" && !content.trim()) continue
    const clipped =
      content.length > MAX_CHARS_PER_HISTORY_MESSAGE
        ? `${content.slice(0, MAX_CHARS_PER_HISTORY_MESSAGE)}\n…（上文已截断）`
        : content
    out.push({ role, content: clipped })
  }

  let tail =
    out.length > MAX_CONVERSATION_HISTORY_MESSAGES
      ? out.slice(-MAX_CONVERSATION_HISTORY_MESSAGES)
      : out
  while (tail.length > 0 && tail[0].role === "assistant") {
    tail = tail.slice(1)
  }
  return tail
}

function summarizeFailures(failures: CopywritingProviderFailure[]): Array<{
  provider: string
  model: string
  status?: number
  reason: string
}> {
  return failures.map((failure) => ({
    provider: failure.name,
    model: failure.model,
    ...(failure.status == null ? {} : { status: failure.status }),
    reason: failure.reason,
  }))
}

/** 客户端断开时取消上游 SSE；只有实际收到正文才执行计费。 */
function pipeSseWithBillingOnSuccess(
  upstreamBody: ReadableStream<Uint8Array>,
  clientSignal: AbortSignal,
  memory: MemoryRetrievalResult,
  billing: {
    cookieHeader: string
    modelId: string
    userId: number
    refId: string
  },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader()
      let sawContent = false
      controller.enqueue(
        encoder.encode(
          `event: memory\ndata: ${JSON.stringify({
            status: memory.status,
            count: memory.count,
            items: memory.items,
          })}\n\n`,
        ),
      )
      const onAbort = () => {
        reader.cancel().catch(() => {})
      }
      clientSignal.addEventListener("abort", onAbort, { once: true })
      try {
        while (!clientSignal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          if (value?.byteLength) {
            sawContent = true
            controller.enqueue(value)
          }
        }
        if (sawContent) {
          try {
            const result = await chargeBillingEvent({
              cookieHeader: billing.cookieHeader,
              billingKey: "copywriting.llm_call",
              params: { modelId: billing.modelId },
              refId: billing.refId,
            })
            const event =
              `event: billing\ndata: ${JSON.stringify({
                costCredits: result.cost,
                balance: result.balance,
              })}\n\n`
            controller.enqueue(encoder.encode(event))
          } catch (error) {
            const message = error instanceof Error ? error.message : "CHARGE_FAILED"
            const event = `event: billing_error\ndata: ${JSON.stringify({ code: message })}\n\n`
            controller.enqueue(encoder.encode(event))
          }
        }
      } catch {
        /* upstream cancelled or client gone */
      } finally {
        clientSignal.removeEventListener("abort", onAbort)
        reader.cancel().catch(() => {})
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })
}

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: {
    userMessage?: string
    agentName?: string
    images?: IncomingImage[]
    conversationHistory?: unknown
    memoryContext?: string
    /** 兼容旧客户端；模型由服务端云端配置决定，该字段不会参与选路。 */
    modelId?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const userMessage = typeof body.userMessage === "string" ? body.userMessage.trim() : ""
  const agentName = typeof body.agentName === "string" ? body.agentName.trim() : ""
  const rawImages = Array.isArray(body.images) ? body.images : []
  const conversationHistory = sanitizeConversationHistory(body.conversationHistory)

  const sanitizedImages: { mime: string; dataBase64: string }[] = []
  for (const image of rawImages) {
    if (sanitizedImages.length >= MAX_IMAGE_ATTACHMENTS) break
    let dataBase64 =
      typeof image?.dataBase64 === "string" ? image.dataBase64.replace(/\s/g, "") : ""
    const embedded = /^data:image\/[^;]+;base64,(.+)$/i.exec(dataBase64)
    if (embedded) dataBase64 = embedded[1].replace(/\s/g, "")
    if (!dataBase64) continue
    if (dataBase64.length > MAX_BASE64_CHARS_PER_IMAGE) {
      return NextResponse.json({ detail: "单张图片过大，请压缩后重试" }, { status: 400 })
    }
    let mime = typeof image?.mimeType === "string" ? image.mimeType.trim().toLowerCase() : ""
    if (!mime.startsWith("image/")) mime = "image/jpeg"
    sanitizedImages.push({ mime, dataBase64 })
  }

  const hasImages = sanitizedImages.length > 0
  const effectiveUserText =
    userMessage ||
    (hasImages ? "请结合上传的图片，按系统设定的创作角色完成需求（可直接输出成稿）。" : "")

  if (!effectiveUserText && !hasImages) {
    return NextResponse.json({ detail: "缺少正文或图片" }, { status: 400 })
  }
  if (!agentName) {
    return NextResponse.json({ detail: "缺少 agentName" }, { status: 400 })
  }

  const workflowKnowledge = getWorkflowKnowledgeForAgent(agentName)
  // memoryContext remains a compatibility-only field.  It is intentionally
  // ignored so a client cannot forge account memory into the system prompt.
  const memory = await retrieveServerMemory({
    cookieHeader,
    scope: "copywriting",
    agentName,
    query: effectiveUserText,
  })
  const enrichedSystemContent = buildCopywritingEnrichedSystemPrompt({
    agentName,
    workflowKnowledge,
    memoryContext: memory.context,
  })

  const userContent: string | CopywritingContentPart[] = hasImages
    ? [
        { type: "text", text: effectiveUserText },
        ...sanitizedImages.map(({ mime, dataBase64 }) => ({
          type: "image_url" as const,
          image_url: { url: `data:${mime};base64,${dataBase64}` },
        })),
      ]
    : effectiveUserText
  const upstreamMessages: CopywritingChatMessage[] = [
    { role: "system", content: enrichedSystemContent },
    ...conversationHistory,
    { role: "user", content: userContent },
  ]

  const providers = listCopywritingProviderCandidates({ hasImages })
  if (providers.length === 0) {
    const desktopRuntime = readServerEnv("DESKTOP_RUNTIME") === "1"
    return NextResponse.json(
      {
        detail: {
          code: desktopRuntime ? "CLOUD_MODEL_NOT_READY" : "MODEL_NOT_CONFIGURED",
          message: desktopRuntime
            ? "云端模型配置尚未同步完成，请稍后重试；若持续出现，请重新登录客户端。"
            : "未配置可用文案模型；开发环境请配置 DeepSeek、Ark 或 NewAPI。",
        },
      },
      { status: 503 },
    )
  }

  const connection = await connectCopywritingStream({
    providers,
    messages: upstreamMessages,
    signal: request.signal,
  })
  if (!connection.ok) {
    const attempts = summarizeFailures(connection.failures)
    console.error("[chat-stream] all copywriting providers failed", attempts)
    return NextResponse.json(
      {
        detail: {
          code: "CLOUD_MODEL_UNAVAILABLE",
          message: "云端模型暂不可用，请稍后重试。",
          attempts,
        },
      },
      { status: 502 },
    )
  }

  if (connection.failures.length > 0) {
    console.warn(
      "[chat-stream] provider failover",
      summarizeFailures(connection.failures),
      "selected=",
      { provider: connection.provider.name, model: connection.provider.model },
    )
  }

  const billingModelId = connection.provider.model
  const needCredits = estimateBillingCost("copywriting.llm_call", { modelId: billingModelId })
  try {
    const balance = await getCreditBalance(cookieHeader)
    if (balance < needCredits) {
      await connection.response.body?.cancel().catch(() => {})
      return NextResponse.json(
        {
          detail: {
            code: "INSUFFICIENT_CREDIT",
            message: "积分不足",
            need: needCredits,
            have: balance,
          },
        },
        { status: 402 },
      )
    }
  } catch {
    /* 余额查询失败不阻断；最终扣费仍由云端校验。 */
  }

  const upstreamBody = connection.response.body
  if (!upstreamBody) {
    return NextResponse.json(
      {
        detail: {
          code: "CLOUD_MODEL_UNAVAILABLE",
          message: "云端模型未返回响应流，请稍后重试。",
        },
      },
      { status: 502 },
    )
  }

  console.log(
    `[chat-stream] provider=${connection.provider.name}, model=${connection.provider.model}, url=${connection.provider.url}`,
  )
  const refId = `chat-stream:${userId}:${crypto.randomBytes(8).toString("hex")}`
  return new Response(
    pipeSseWithBillingOnSuccess(upstreamBody, request.signal, memory, {
      cookieHeader,
      modelId: billingModelId,
      userId,
      refId,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    },
  )
})
