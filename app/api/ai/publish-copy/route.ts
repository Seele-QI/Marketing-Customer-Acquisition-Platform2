import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import { PUBLISH_COPY_SYSTEM } from "@/lib/prompts/publish-copy-system"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

function parsePublishCopy(raw: string): {
  title: string
  titleCandidates: string[]
  description: string
  tags: string[]
} | null {
  const trimmed = raw.trim()
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    const data = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const title = typeof data.title === "string" ? data.title.trim() : ""
    const description = typeof data.description === "string" ? data.description.trim() : ""
    const candidatesRaw = data.title_candidates ?? data.titleCandidates
    const titleCandidates = Array.isArray(candidatesRaw)
      ? candidatesRaw
          .map((item) => (typeof item === "string" ? item.trim().slice(0, 30) : ""))
          .filter(Boolean)
          .slice(0, 3)
      : []
    const tagsRaw = data.tags
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw
          .map((t) => (typeof t === "string" ? t.trim().replace(/^#/, "") : ""))
          .filter(Boolean)
          .slice(0, 5)
      : []
    if (!title && !description) return null
    return { title, titleCandidates, description, tags }
  } catch {
    return null
  }
}

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const rec = (body && typeof body === "object" ? body : {}) as Record<string, unknown>
  const hint =
    (typeof rec.hint === "string" ? rec.hint : "") ||
    (typeof rec.video_title === "string" ? rec.video_title : "") ||
    (typeof rec.title === "string" ? rec.title : "")
  const platform = typeof rec.platform === "string" ? rec.platform.trim() : "douyin"
  const draft = typeof rec.draft === "string" ? rec.draft.trim() : ""

  if (!hint.trim() && !draft.trim()) {
    return NextResponse.json({ detail: "请提供视频主题或已有草稿" }, { status: 400 })
  }

  const refId = `publish-copy:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_chat", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const userContent = [
    `目标平台：${platform}`,
    hint.trim() ? `视频主题/文件名：${hint.trim()}` : "",
    draft.trim() ? `已有草稿（可优化）：${draft.trim()}` : "",
    "除 title、description、tags 外，请返回 title_candidates 数组，包含搜索型、利益型、场景型三个不同标题，每个不超过30字。",
    "请生成 title、description、tags。",
  ]
    .filter(Boolean)
    .join("\n")

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: PUBLISH_COPY_SYSTEM },
      { role: "user", content: userContent },
    ],
    60_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  const parsed = parsePublishCopy(result.text)
  if (!parsed) {
    return NextResponse.json({ detail: "AI 返回格式异常，请重试" }, { status: 502 })
  }

  return NextResponse.json({
    status: "success",
    title: parsed.title.slice(0, 30),
    titleCandidates: parsed.titleCandidates.length
      ? parsed.titleCandidates
      : [parsed.title.slice(0, 30)],
    description: parsed.description.slice(0, 1000),
    tags: parsed.tags,
  })
})
