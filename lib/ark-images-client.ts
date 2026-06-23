export type ArkImageRefPayload = { mimeType: string; dataBase64: string }

/** 图生图/文生图可能较慢；超时后结束等待并提示检查密钥与接入点 */
const ARK_IMAGES_TIMEOUT_MS = 120_000

export async function callArkImagesGeneration(input: {
  prompt: string
  n: number
  resolution?: string
  referenceImages?: ArkImageRefPayload[]
}): Promise<string[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ARK_IMAGES_TIMEOUT_MS)
  try {
    const res = await fetch("/api/ai/ark-images", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: controller.signal,
    })

    let data: { urls?: string[]; detail?: string; errorMessage?: string; errorType?: string }
    try {
      data = (await res.json()) as { urls?: string[]; detail?: string; errorMessage?: string; errorType?: string }
    } catch {
      throw new Error(`接口返回非 JSON（HTTP ${res.status}），请查看终端或浏览器网络面板。`)
    }

    if (!res.ok) {
      let fallback = `HTTP ${res.status}`
      if (data.errorMessage) {
        fallback = `网关异常：${data.errorMessage} ${data.errorType ? `(${data.errorType})` : ""}`
      }
      throw new Error(typeof data.detail === "string" ? data.detail : fallback)
    }
    return Array.isArray(data.urls) ? data.urls : []
  } catch (e) {
    const aborted =
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    if (aborted) {
      throw new Error(
        `生图请求超过 ${ARK_IMAGES_TIMEOUT_MS / 1000}s 未返回。请缩小参考图体积，或在 .env.local 配置视觉服务 API Key 与生图模型接入点（AI 平台控制台「图像生成」豆包/Seedream 等接入点），保存后重启 dev。`,
      )
    }
    if (e instanceof TypeError) {
      throw new Error("网络异常：无法连接本应用接口，请检查是否已启动 dev、代理或 HTTPS 混合内容限制。")
    }
    throw e instanceof Error ? e : new Error("生成失败")
  } finally {
    clearTimeout(timer)
  }
}
