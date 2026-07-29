import crypto from "node:crypto"

import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { proxyToFastapi } from "@/lib/fastapi-base"
import { parsePosterGenerationRequest } from "@/lib/poster/types"

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  try {
    body = parsePosterGenerationRequest(body)
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "海报参数无效" },
      { status: 400 },
    )
  }

  const refId = `poster-image:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({
      cookieHeader,
      scene: "poster_image",
      refId,
    })
  } catch (error) {
    return chargeErrorResponse(error)
  }

  const proxyRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(body),
  })
  return proxyToFastapi(proxyRequest, "/api/poster/generate")
})
