import crypto from "node:crypto"

import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { proxyToFastapi } from "@/lib/fastapi-base"
import { IMAGE_WORKBENCH_STRATEGIES } from "@/lib/image-workbench/strategies"
import { parseImageWorkbenchRequest } from "@/lib/image-workbench/types"

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  let parsed: ReturnType<typeof parseImageWorkbenchRequest>
  try {
    parsed = parseImageWorkbenchRequest(body)
  } catch (error) {
    return Response.json(
      { detail: error instanceof Error ? error.message : "图片创作参数无效" },
      { status: 400 },
    )
  }

  const strategy = IMAGE_WORKBENCH_STRATEGIES[parsed.mode]
  const billingScene =
    parsed.mode === "poster" ? "poster_image" : "image_creation"
  if (strategy.billingScene !== billingScene) {
    return Response.json({ detail: "图片计费策略不一致" }, { status: 500 })
  }

  try {
    await chargeCredit({
      cookieHeader,
      scene: billingScene,
      refId: `image-workbench:${parsed.mode}:${userId}:${crypto.randomBytes(8).toString("hex")}`,
    })
  } catch (error) {
    return chargeErrorResponse(error)
  }

  const proxyRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(parsed),
  })
  return proxyToFastapi(proxyRequest, "/api/image-workbench/generate")
})
