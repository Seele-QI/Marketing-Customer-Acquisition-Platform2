import { normalizeArkBaseUrl } from "@/lib/ark-images-api"
import { readServerEnv } from "@/lib/server-env"

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

function inferEndpointIdFromRawArkKey(raw: string): string {
  const t = raw.trim()
  return /^ep-/i.test(t) ? t : ""
}

function extractUpstreamError(parsed: unknown, rawText: string): string {
  if (!parsed || typeof parsed !== "object") return rawText.slice(0, 800)
  const o = parsed as Record<string, unknown>
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
  const err = o.error
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string" && e.message.trim()) return e.message.trim()
  }
  return rawText.slice(0, 800)
}

function extractAssistantText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return ""
  const o = parsed as Record<string, unknown>
  const choices = o.choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const first = choices[0]
  if (!first || typeof first !== "object") return ""
  const msg = (first as Record<string, unknown>).message
  if (!msg || typeof msg !== "object") return ""
  const content = (msg as Record<string, unknown>).content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const p of content) {
      if (!p || typeof p !== "object") continue
      const rec = p as Record<string, unknown>
      if (rec.type === "text" && typeof rec.text === "string") chunks.push(rec.text)
    }
    return chunks.join("").trim()
  }
  return ""
}

/**
 * 火山方舟 OpenAI 兼容 Chat Completions（非流式），用于豆包等多模态识图 + 文本输出。
 * model 使用 ARK_ENDPOINT_ID（在线推理接入点，须支持 vision）。
 */
export async function arkChatCompletionNonStream(input: {
  system: string
  userParts: ChatContentPart[]
  timeoutMs?: number
  /** 若指定则优先作为 chat/completions 的 model（接入点 ID），否则读环境变量 ARK_ENDPOINT_ID */
  modelId?: string
}): Promise<
  { ok: true; text: string } | { ok: false; status: number; detail: string }
> {
  /** 识图 / Chat Completions 仅用通用方舟密钥，勿优先 ARK_IMAGE_API_KEY（生图专用） */
  const rawArkKey = readServerEnv("ARK_API_KEY")
  const arkSecret =
    readServerEnv("ARK_API_SECRET") || readServerEnv("VOLCENGINE_API_KEY")
  const bearer = (arkSecret || rawArkKey).trim()
  const endpointId =
    (input.modelId || "").trim() ||
    readServerEnv("ARK_ENDPOINT_ID") ||
    readServerEnv("ARK_MODEL") ||
    readServerEnv("ARK_IMAGE_ENDPOINT_ID") ||
    inferEndpointIdFromRawArkKey(rawArkKey)

  if (!bearer) {
    return {
      ok: false,
      status: 503,
      detail:
        "未配置 AI 视觉服务鉴权（识图 / 对话）：请设置视觉服务 API Key。生图专用密钥请仅用于生图接口，由 /images/generations 接口读取。本地 .env.local / 线上 Environment variables；保存后重启或重新部署。",
    }
  }
  if (!endpointId) {
    return {
      ok: false,
      status: 503,
      detail:
        "未配置可用的 AI 视觉服务接入点（模型接入点 ID 至少其一）。带参考图的「智能调整」优先走 AI 视觉识图；亦可在配置 AI 服务密钥时自动回退 AI 模型多模态。值勿加英文引号；本地 .env.local / 线上 Environment variables。",
    }
  }

  const base =
    normalizeArkBaseUrl(readServerEnv("ARK_BASE_URL")) || DEFAULT_ARK_BASE_URL
  const url = `${base}/chat/completions`
  const timeoutMs = input.timeoutMs ?? 120_000

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: endpointId,
        stream: false,
        messages: [
          { role: "system", content: input.system },
          { role: "user", content: input.userParts },
        ],
      }),
      signal: controller.signal,
    })

    const rawText = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText) as unknown
    } catch {
      return {
        ok: false,
        status: 502,
        detail: `AI 平台返回非 JSON（HTTP ${res.status}）：${rawText.slice(0, 400)}`,
      }
    }

    if (!res.ok) {
      const msg = extractUpstreamError(parsed, rawText)
      const status =
        res.status >= 400 && res.status < 600 ? res.status : 502
      return {
        ok: false,
        status,
        detail: `AI 识图/对话失败（${res.status}）：${msg}`,
      }
    }

    const text = extractAssistantText(parsed)
    if (!text) {
      return {
        ok: false,
        status: 502,
        detail: "AI 平台返回成功但未解析到助手正文，请确认接入点为支持多模态的视觉模型。",
      }
    }
    return { ok: true, text }
  } catch (e) {
    const aborted =
      (typeof DOMException !== "undefined" &&
        e instanceof DOMException &&
        e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    if (aborted) {
      return {
        ok: false,
        status: 504,
        detail: `请求超过 ${timeoutMs / 1000}s 未返回，请缩小参考图后重试。`,
      }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, detail: `调用 AI 视觉服务失败: ${msg}` }
  } finally {
    clearTimeout(timer)
  }
}
