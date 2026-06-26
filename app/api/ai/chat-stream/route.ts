import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { buildCopywritingEnrichedSystemPrompt } from "@/lib/prompts/copywriting-agent-systems"
import { getWorkflowKnowledgeForAgent } from "@/lib/prompts/copywriting-workflow-knowledge"
import { deepseekApiKeyMissingUserMessage, getDeepseekApiKey, readServerEnv } from "@/lib/server-env"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

export const runtime = "nodejs"

/** 允许最大 10 MB 请求体（图片 Base64 较大） */
export const maxDuration = 120


/**
 * 流式对话（SSE 透传）
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 * 纯文本：DeepSeek Chat Completions（需 DEEPSEEK_API_KEY）
 *
 * 含图片 + 方舟：
 *   使用「Chat Completions」POST ${ARK_BASE_URL}/chat/completions（与 OpenAI 多模态一致）
 *   user 消息的 content 为数组：{ type: "text", text } 与 { type: "image_url", image_url: { url: data:... } }
 *   （须绑定视觉模型接入点；若误用纯文本接入点或 Responses 专用格式，易出现 unknown variant 等报错）
 *
 * 含图片 + 仅 DeepSeek：仍走 Chat Completions 多模态（DEEPSEEK_VISION_MODEL）
 *
 * ARK_BASE_URL 默认 https://ark.cn-beijing.volces.com/api/v3
 * ARK_ENDPOINT_ID / ARK_MODEL：推理接入点 ID（ep- 或 ark- 开头）
 * ARK_API_KEY：控制台「API Key 管理」里创建的密钥（Bearer），不是接入点 ID。
 * ARK_ENDPOINT_ID：「在线推理」里该接入点的 ID，多为 ep- 开头；须与 API Key 同属账号且已开通调用。
 * ARK_BASE_URL 地域须与接入点一致（如华北2北京：https://ark.cn-beijing.volces.com/api/v3）。
 * ARK_API_SECRET（可选）：与 ARK_API_KEY 二选一作为 Bearer。
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 */

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"

const DEFAULT_TEXT_MODEL = "deepseek-chat"
const DEFAULT_VISION_MODEL = "deepseek-v4-flash"

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

const MAX_IMAGE_ATTACHMENTS = 6
const MAX_BASE64_CHARS_PER_IMAGE = 28_000_000

const MAX_CONVERSATION_HISTORY_MESSAGES = 40
const MAX_CHARS_PER_HISTORY_MESSAGE = 24_000

type SanitizedTurn = { role: "user" | "assistant"; content: string }

function sanitizeConversationHistory(raw: unknown): SanitizedTurn[] {
  if (!Array.isArray(raw)) return []
  const out: SanitizedTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== "object") continue
    const r = item as Record<string, unknown>
    if (r.role !== "user" && r.role !== "assistant") continue
    const role = r.role
    const content = typeof r.content === "string" ? r.content : ""
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

/** DeepSeek Chat Completions 多模态片段 */
type ChatCompletionContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

type IncomingImage = { mimeType?: string; dataBase64?: string }

/**
 * 仅当用户把接入点误写在 ARK_API_KEY 时做推断。
 * 控制台「在线推理」的接入点 ID 多为 ep- 开头；ark-… 常被误当成密钥或资源 ID，不能当作 model。
 */
function inferEndpointIdFromRawArkKey(raw: string): string {
  const t = raw.trim()
  return /^ep-/i.test(t) ? t : ""
}

function appendArkEndpointHint(errBody: string): string {
  if (
    !errBody.includes("InvalidEndpointOrModel") &&
    !errBody.includes("NotFound") &&
    !errBody.includes("does not exist")
  ) {
    return errBody
  }
  return (
    errBody +
    "\n\n——\n【配置说明】上述表示当前请求里的 model（接入点 ID）在 AI 平台侧不存在或当前 API Key 无权调用。\n" +
    "1. 打开 AI 平台 → 模型推理 → 在线推理，点开你的接入点，复制页面上的「接入点 ID」（一般为 ep- 开头）。\n" +
    "2. 在 .env 中设置：ARK_ENDPOINT_ID=该 ep- ID；ARK_API_KEY=「API Key 管理」里创建的密钥（不要把接入点 ID 当 Key）。\n" +
    "3. 确认 ARK_BASE_URL 与接入点地域一致（北京示例：https://ark.cn-beijing.volces.com/api/v3）。\n" +
    "4. 若仍报错，在控制台确认该接入点已启用、账号有该模型权限。"
  )
}

function normalizeArkBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "")
  if (t.endsWith("/chat/completions")) {
    t = t.slice(0, -"/chat/completions".length).replace(/\/+$/, "")
  }
  if (t.endsWith("/responses")) {
    t = t.slice(0, -"/responses".length).replace(/\/+$/, "")
  }
  return t
}

/** 客户端断开时取消上游 SSE 读取，避免空转。 */
function pipeUpstreamSse(upstreamBody: ReadableStream<Uint8Array>, clientSignal: AbortSignal): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstreamBody.getReader()
      const onAbort = () => {
        reader.cancel().catch(() => {})
        try {
          controller.close()
        } catch {
          /* already closed */
        }
      }
      clientSignal.addEventListener("abort", onAbort, { once: true })
      try {
        while (!clientSignal.aborted) {
          const { done, value } = await reader.read()
          if (done) break
          controller.enqueue(value)
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
    /** 用户记忆上下文（前端 localStorage 提取后传入） */
    memoryContext?: string
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
  for (const img of rawImages) {
    if (sanitizedImages.length >= MAX_IMAGE_ATTACHMENTS) break
    let dataBase64 =
      typeof img?.dataBase64 === "string" ? img.dataBase64.replace(/\s/g, "") : ""
    // 若前端误传整段 data URL，只保留逗号后的纯 Base64（避免重复前缀）
    const embedded = /^data:image\/[^;]+;base64,(.+)$/i.exec(dataBase64)
    if (embedded) dataBase64 = embedded[1].replace(/\s/g, "")
    if (!dataBase64) continue
    if (dataBase64.length > MAX_BASE64_CHARS_PER_IMAGE) {
      return NextResponse.json({ detail: "单张图片过大，请压缩后重试" }, { status: 400 })
    }
    let mime = typeof img?.mimeType === "string" ? img.mimeType.trim().toLowerCase() : ""
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
  const memoryContext = typeof body.memoryContext === "string" ? body.memoryContext.trim() : ""

  const enrichedSystemContent = buildCopywritingEnrichedSystemPrompt({
    agentName,
    workflowKnowledge,
    memoryContext,
  })

  const historyMessages: { role: string; content: string }[] = conversationHistory.map((t) => ({
    role: t.role,
    content: t.content,
  }))

  const deepseekKey = getDeepseekApiKey()
  const rawArkKey = readServerEnv("ARK_API_KEY")
  const arkSecret =
    readServerEnv("ARK_API_SECRET") || readServerEnv("VOLCENGINE_API_KEY")
  const explicitArkEndpoint =
    readServerEnv("ARK_ENDPOINT_ID") || readServerEnv("ARK_MODEL")

  const arkEndpointId =
    explicitArkEndpoint || inferEndpointIdFromRawArkKey(rawArkKey)
  /** 带图对话走 chat/completions，Bearer 用识图/通用 Key，与生图专用 ARK_IMAGE_API_KEY 分离 */
  const arkBearer = (arkSecret || rawArkKey).trim()
  const useArkVisionChat = hasImages && Boolean(arkEndpointId) && Boolean(arkBearer)

  let upstreamUrl: string
  let authorization: string
  let requestBody: Record<string, unknown>
  let providerLabel: string

  if (!hasImages) {
    if (!deepseekKey) {
      return NextResponse.json(
        {
          detail: deepseekApiKeyMissingUserMessage(),
        },
        { status: 503 },
      )
    }
    const textModel = readServerEnv("DEEPSEEK_CHAT_MODEL") || DEFAULT_TEXT_MODEL
    const userPayload: { role: "user"; content: string } = {
      role: "user",
      content: effectiveUserText,
    }
    upstreamUrl = DEEPSEEK_CHAT_URL
    authorization = `Bearer ${deepseekKey}`
    requestBody = {
      model: textModel,
      stream: true,
      messages: [{ role: "system", content: enrichedSystemContent }, ...historyMessages, userPayload],
    }
    providerLabel = "AI 模型"
  } else if (useArkVisionChat) {
    const base =
      normalizeArkBaseUrl(readServerEnv("ARK_BASE_URL")) || DEFAULT_ARK_BASE_URL
    upstreamUrl = `${base}/chat/completions`
    authorization = `Bearer ${arkBearer}`

    // 方舟 Vision（Chat Completions）：user.content 必须为多模态块数组（与 OpenAI 对齐）
    const userContentParts: ChatCompletionContentPart[] = [
      { type: "text", text: effectiveUserText },
      ...sanitizedImages.map(({ mime, dataBase64 }) => ({
        type: "image_url" as const,
        image_url: {
          url: `data:${mime};base64,${dataBase64}`,
        },
      })),
    ]

    requestBody = {
      model: arkEndpointId,
      stream: true,
      messages: [
        { role: "system", content: enrichedSystemContent },
        ...historyMessages,
        { role: "user", content: userContentParts },
      ],
    }
    providerLabel = "AI 视觉"
  } else if (deepseekKey) {
    const visionModel = readServerEnv("DEEPSEEK_VISION_MODEL") || DEFAULT_VISION_MODEL
    const parts: ChatCompletionContentPart[] = sanitizedImages.map(({ mime, dataBase64 }) => ({
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${dataBase64}`,
      },
    }))
    parts.push({ type: "text", text: effectiveUserText })

    upstreamUrl = DEEPSEEK_CHAT_URL
    authorization = `Bearer ${deepseekKey}`
    requestBody = {
      model: visionModel,
      stream: true,
      messages: [
        { role: "system", content: enrichedSystemContent },
        ...historyMessages,
        { role: "user", content: parts },
      ],
    }
    providerLabel = "AI 模型"
  } else {
    return NextResponse.json(
      {
        detail:
          "含图片时请配置 AI 视觉服务：视觉服务 API Key（识图/通用）与视觉模型接入点（支持视觉的多模态接入点）。生图专用密钥不会用于此处。本地 .env.local / 线上 Environment variables；值勿加引号。或配置 AI 服务密钥走 AI 模型多模态。",
      },
      { status: 503 },
    )
  }

  console.log(`[chat-stream] provider=${providerLabel}, hasImages=${hasImages}, model=${(requestBody as Record<string, unknown>).model}, url=${upstreamUrl}`)

  const refId = `chat-stream:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_chat", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const upstreamSignal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(90_000),
  ])

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Type": "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify(requestBody),
      signal: upstreamSignal,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error(`[chat-stream] fetch ${providerLabel} error:`, msg)
    return NextResponse.json(
      { detail: `请求 ${providerLabel} 失败: ${msg}` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    const errText = await upstream.text()
    const raw = errText.slice(0, 8000) || `HTTP ${upstream.status}`
    const detail =
      providerLabel.includes("AI 视觉") || upstreamUrl.includes("volces.com")
        ? appendArkEndpointHint(raw)
        : raw
    return NextResponse.json(
      { detail },
      {
        status:
          upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502,
      },
    )
  }

  if (!upstream.body) {
    return NextResponse.json({ detail: "上游无响应体" }, { status: 502 })
  }

  return new Response(pipeUpstreamSse(upstream.body, request.signal), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
})
