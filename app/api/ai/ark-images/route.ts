import crypto from "node:crypto"
import { NextResponse } from "next/server"

import {
  extractImageUrlsFromGenerationsJson,
  mapResolutionToSize,
  normalizeArkBaseUrl,
} from "@/lib/ark-images-api"
import { readServerEnv } from "@/lib/server-env"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

export const maxDuration = 120

const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

type RefImage = { mimeType?: string; dataBase64?: string }

function extractUpstreamErrorMessage(parsed: unknown, rawText: string): string {
  if (!parsed || typeof parsed !== "object") return rawText.slice(0, 700)
  const o = parsed as Record<string, unknown>
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
  const err = o.error
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string" && e.message.trim()) return e.message.trim()
    return JSON.stringify(err)
  }
  return rawText.slice(0, 700)
}

/** AI 平台 images/generations 常见顶层或嵌套 error.code */
function extractArkErrorCode(parsed: unknown): string | null {
  if (!parsed || typeof parsed !== "object") return null
  const o = parsed as Record<string, unknown>
  if (typeof o.code === "string" && o.code.trim()) return o.code.trim()
  const err = o.error
  if (err && typeof err === "object") {
    const c = (err as Record<string, unknown>).code
    if (typeof c === "string" && c.trim()) return c.trim()
  }
  return null
}

function friendlyArkImageGenerationDetail(params: {
  code: string | null
  upstreamMsg: string
}): string | null {
  const { code, upstreamMsg } = params
  const c = code || ""
  const msgLower = upstreamMsg.toLowerCase()

  if (c === "InputImageSensitiveContentDetected" || /InputImageSensitiveContentDetected/i.test(upstreamMsg)) {
    return [
      "参考图未通过 AI 内容安全审核。",
      "",
      "常见原因：参考图中含易被判定为敏感的人物、符号、标语或场景（图生图会整图送审）。",
      "",
      "建议：换用中性参考图（如科幻城市、静物、抽象纹理、无真人肖像的素材），或先移除参考图，仅用提示词描述「赛博风格」等画面再生成。",
    ].join("\n")
  }

  if (c === "OutputImageSensitiveContentDetected" || /OutputImageSensitiveContentDetected/i.test(upstreamMsg)) {
    return [
      "生成结果未通过 AI 内容安全审核，本次未返回图片。",
      "",
      "请弱化提示词中可能触发审核的表述，或更换参考图/主题后重试。",
    ].join("\n")
  }

  if (
    c === "InvalidParameter.OversizeImage" ||
    /OversizeImage/i.test(upstreamMsg) ||
    /exceeds the limit.*10\s*MiB/i.test(msgLower)
  ) {
    return [
      "参考图体积超过 AI 平台上限（约 10MB）。",
      "",
      "请换用更小的 JPG/PNG，或在本地压缩后再上传；应用也会尝试自动压缩大图，若仍失败请降低分辨率。",
    ].join("\n")
  }

  if (c === "InputTextSensitiveContentDetected" || /InputTextSensitiveContentDetected/i.test(upstreamMsg)) {
    return "提示词未通过 AI 内容安全审核。请调整描述后重试。"
  }

  return null
}

/** 上游 400 InvalidParameter：model 非生图接入点 */
function isModelNotImageCapableMessage(msg: string): boolean {
  return (
    /image generation is only supported by certain models/i.test(msg) ||
    /parameter ['"]model['"] specified.*not valid/i.test(msg) ||
    (/InvalidParameter/i.test(msg) && /model/i.test(msg) && /not valid/i.test(msg))
  )
}

function buildImageModelErrorDetail(params: {
  status: number
  upstreamMsg: string
  endpointId: string
  usedDedicatedImageEndpoint: boolean
}): string {
  const { status, upstreamMsg, endpointId, usedDedicatedImageEndpoint } = params
  const epShort = endpointId.length > 48 ? `${endpointId.slice(0, 20)}…${endpointId.slice(-8)}` : endpointId

  const fix = usedDedicatedImageEndpoint
    ? `当前生图模型接入点为「${epShort}」，但 AI 平台判定其不支持生图。请到控制台核对该接入点类型是否为「图像生成」，或更换为支持 OpenAI 兼容生图的 Seedream / 豆包图模接入点。`
    : `当前请求里的 model 为「${epShort}」——因未单独配置生图接入点，程序回退使用了通用模型接入点。**对话 / 文本大模型的接入点不能用于生图**，因此会报 InvalidParameter。\n\n请打开 AI 平台控制台 → 在线推理，**单独创建或选用「图像生成」类接入点**（豆包图生图、Seedream 等），把 **接入点 ID（ep- 开头）** 写入 \`.env.local\` 的 **生图模型接入点=ep-xxxx**，勿与对话接入点混用；保存后重启 dev。`

  return `AI 图片生成失败（${status}）\n\n${fix}\n\n（上游说明：${upstreamMsg.slice(0, 320)}${upstreamMsg.length > 320 ? "…" : ""}）`
}

function isEndpointNotFoundMessage(msg: string): boolean {
  return (
    /InvalidEndpointOrModel\.NotFound/i.test(msg) ||
    /does not exist or you do not have access/i.test(msg)
  )
}

function buildEndpointNotFoundDetail(endpointId: string): string {
  const epShort = endpointId.length > 40 ? `${endpointId.slice(0, 18)}…${endpointId.slice(-6)}` : endpointId
  return [
    `AI 平台返回 404：接入点「${epShort}」不存在，或当前 API Key 无权调用该接入点。`,
    "",
    "请按顺序自查：",
    "1）视觉服务 API Key（若设置了生图专用密钥则看该项）必须与创建该「生图」接入点的 AI 平台主账号一致；不要用别的账号截图里的 ep。",
    "2）控制台 → AI 平台 → 在线推理：在**当前账号**下找到状态为「健康」的图像生成接入点，打开概览，将「服务 ID / 接入点 ID」**原样**写入 .env.local 的生图模型接入点配置项。",
    "3）若接入点已停止、删除或欠费，会报 NotFound；需重新创建或启用后再复制新 ID。",
    "4）API 基础地址须与接入点地域一致。",
    "",
    "修改 .env.local 后务必重启 Next（pnpm dev）。",
  ].join("\n")
}

/**
 * AI 平台文生图 / 图生图（OpenAI 兼容 images/generations）
 * 环境变量：视觉服务 API Key、API 基础地址、生图模型接入点 ID（推荐：须为「图像生成」接入点）。
 * 若未单独配置生图接入点，将按顺序尝试通用接入点 ID（须本身是生图 ep，对话接入点会报 InvalidParameter）。
 * 可选：若「API 接入」里为该生图服务单独下发的 Key 与通用 Key 不同，可单独配置。
 */
export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  const apiKey = readServerEnv("ARK_API_KEY")
  const apiSecret = readServerEnv("ARK_API_SECRET") || readServerEnv("VOLCENGINE_API_KEY")
  const imageApiKeyExclusive = readServerEnv("ARK_IMAGE_API_KEY")
  const bearer = (imageApiKeyExclusive || apiSecret || apiKey).trim()

  const explicitImageEp = readServerEnv("ARK_IMAGE_ENDPOINT_ID")
  const endpointId =
    explicitImageEp ||
    readServerEnv("ARK_ENDPOINT_ID") ||
    readServerEnv("ARK_MODEL")
  const usedDedicatedImageEndpoint = Boolean(explicitImageEp)

  const base =
    normalizeArkBaseUrl(readServerEnv("ARK_BASE_URL")) || DEFAULT_ARK_BASE_URL

  if (!bearer) {
    return NextResponse.json(
      {
        detail:
          "未配置鉴权：请设置视觉服务 API Key。本地保存 .env.local 后重启 pnpm dev；线上请在托管平台 Site → Environment variables 配置并重新部署。",
      },
      { status: 503 },
    )
  }
  if (!endpointId) {
    return NextResponse.json(
      {
        detail:
          "未配置生图接入点：请设置生图模型接入点 ID（推荐）。\n\n操作：AI 平台控制台 → 在线推理 → 选用「图像生成」类接入点（如 Seedream）→ 复制「服务 ID」（ep- 开头）。\n\n本地：写入 .env.local 的生图模型接入点=ep-xxxx（值勿加英文引号），保存后重启 dev。\n线上：Environment variables 添加同名变量，Clear cache and deploy。\n\n须与视觉服务 API Key 同一主账号。若暂未单独配置生图 ep，也可临时将同一 ep 写入通用接入点配置项，但不应用对话类接入点冒充生图。",
      },
      { status: 503 },
    )
  }

  let body: {
    prompt?: string
    n?: number
    resolution?: string
    referenceImages?: RefImage[]
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) {
    return NextResponse.json({ detail: "缺少提示词 prompt" }, { status: 400 })
  }

  const nRaw = Number(body.n)
  const n = Number.isFinite(nRaw) ? Math.min(4, Math.max(1, Math.floor(nRaw))) : 1
  const size = mapResolutionToSize(typeof body.resolution === "string" ? body.resolution : "2K")

  const refs = Array.isArray(body.referenceImages) ? body.referenceImages : []
  const firstRef = refs.find(
    (r) =>
      r &&
      typeof r.dataBase64 === "string" &&
      r.dataBase64.length > 0 &&
      typeof r.mimeType === "string",
  )

  const payload: Record<string, unknown> = {
    model: endpointId,
    prompt,
    n,
    size,
    response_format: "url",
  }

  // AI 平台常见：单张参考图字段 image（base64 或 data URL）
  if (firstRef?.dataBase64) {
    const mime = firstRef.mimeType!.startsWith("image/") ? firstRef.mimeType! : "image/jpeg"
    const b64 = firstRef.dataBase64.replace(/\s/g, "")
    payload.image = b64.startsWith("data:") ? b64 : `data:${mime};base64,${b64}`
  }

  const refId = `ark-image:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_ark_image", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const url = `${base}/images/generations`
  const upstream = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${bearer}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })

  const rawText = await upstream.text()
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText) as unknown
  } catch {
    return NextResponse.json(
      { detail: `AI 平台返回非 JSON（HTTP ${upstream.status}）：${rawText.slice(0, 500)}` },
      { status: 502 },
    )
  }

  if (!upstream.ok) {
    const msg = extractUpstreamErrorMessage(parsed, rawText)
    if (isModelNotImageCapableMessage(msg)) {
      return NextResponse.json(
        {
          detail: buildImageModelErrorDetail({
            status: upstream.status,
            upstreamMsg: msg,
            endpointId,
            usedDedicatedImageEndpoint,
          }),
        },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      )
    }
    if (upstream.status === 404 || isEndpointNotFoundMessage(msg)) {
      return NextResponse.json(
        { detail: buildEndpointNotFoundDetail(endpointId) },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 404 },
      )
    }
    const bizCode = extractArkErrorCode(parsed)
    const friendly = friendlyArkImageGenerationDetail({
      code: bizCode,
      upstreamMsg: msg,
    })
    if (friendly) {
      return NextResponse.json(
        { detail: friendly },
        { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
      )
    }

    const errObj = parsed as Record<string, unknown>
    const fallbackMsg =
      typeof errObj?.error === "object" && errObj.error !== null
        ? JSON.stringify(errObj.error)
        : msg
    return NextResponse.json(
      { detail: `AI 图片生成失败（${upstream.status}）：${fallbackMsg}` },
      { status: upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502 },
    )
  }

  let urls = extractImageUrlsFromGenerationsJson(parsed)
  if (urls.length === 0) {
    return NextResponse.json(
      { detail: "AI 平台返回成功但未解析到图片 URL，请检查接入点是否为图片生成模型。" },
      { status: 502 },
    )
  }

  /**
   * 部分图像模型单次响应只带 1 张图，即使请求体里 n>1。按需继续请求直至凑齐制作数量，
   * 避免界面「制作数量」与「主图+次图」张数不一致。
   */
  const targetN = n
  const combined: string[] = [...urls]
  let guard = 0
  while (combined.length < targetN && guard < 12) {
    guard++
    const need = targetN - combined.length
    const followPayload: Record<string, unknown> = {
      ...payload,
      n: Math.min(4, need),
    }
    const up2 = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(followPayload),
    })
    const raw2 = await up2.text()
    let parsed2: unknown
    try {
      parsed2 = JSON.parse(raw2) as unknown
    } catch {
      break
    }
    if (!up2.ok) break
    const more = extractImageUrlsFromGenerationsJson(parsed2)
    if (more.length === 0) break
    combined.push(...more)
  }

  urls = combined.slice(0, targetN)
  return NextResponse.json({ urls })
})
