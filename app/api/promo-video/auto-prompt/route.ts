import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { generatePromoAutoPromptWithGpt } from "@/lib/promo-video/auto-prompt-ai"

export const runtime = "nodejs"
export const maxDuration = 120

export const POST = withAuth(async (req) => {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ detail: "无效请求体" }, { status: 400 })
  }

  const result = await generatePromoAutoPromptWithGpt({
    promo_script: String(body.promo_script ?? ""),
    duration: Number(body.duration ?? 15),
    selected_count: Number(body.selected_count ?? 1),
    visual_style: typeof body.visual_style === "string" ? body.visual_style : undefined,
    has_audio_ref: Boolean(body.has_audio_ref),
  })

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ prompt: result.prompt })
})
