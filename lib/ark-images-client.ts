import {
  CUSTOMER_ERROR_MESSAGES,
  FriendlyNetworkError,
  getCustomerFacingErrorMessage,
} from "@/lib/api/customer-network-error"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

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

    let data: { urls?: string[]; detail?: unknown; errorMessage?: string; errorType?: string }
    try {
      data = (await res.json()) as { urls?: string[]; detail?: string; errorMessage?: string; errorType?: string }
    } catch {
      throw new Error(parseApiErrorResponse(res.status, {}, CUSTOMER_ERROR_MESSAGES.generic))
    }

    if (!res.ok) {
      throw new Error(parseApiErrorResponse(res.status, { detail: data.detail }, CUSTOMER_ERROR_MESSAGES.generic))
    }
    return Array.isArray(data.urls) ? data.urls : []
  } catch (e) {
    const aborted =
      (typeof DOMException !== "undefined" && e instanceof DOMException && e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    if (aborted) {
      throw new Error(CUSTOMER_ERROR_MESSAGES.timeout)
    }
    if (e instanceof FriendlyNetworkError) throw e
    throw new Error(getCustomerFacingErrorMessage(e, "生成失败"))
  } finally {
    clearTimeout(timer)
  }
}
