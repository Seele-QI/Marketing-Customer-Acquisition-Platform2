import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { isSupportedDocumentName, MAX_DOCUMENT_BYTES } from "@/lib/ip-positioning-upload"
import { extractDocumentText } from "@/lib/server/document-extract"

export const runtime = "nodejs"

export const POST = withAuth(async (request) => {
  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 })
  }
  const name = typeof body.name === "string" ? body.name.trim() : ""
  const type = typeof body.type === "string" ? body.type : "application/octet-stream"
  const size = typeof body.size === "number" ? body.size : Number.NaN
  const base64 = typeof body.base64 === "string" ? body.base64.trim() : ""
  if (!name || !base64 || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "缺少或无效的文件内容" }, { status: 400 })
  }
  if (!isSupportedDocumentName(name)) {
    return NextResponse.json({ error: "不支持该文件格式" }, { status: 400 })
  }
  if (size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "文件超过 20MB 限制" }, { status: 400 })
  }
  const result = await extractDocumentText({ name, type, size, base64 })
  if (result.error || !result.text) {
    return NextResponse.json({ error: result.error || "未能提取有效正文" }, { status: 422 })
  }
  return NextResponse.json({
    name: result.name,
    text: result.text,
    size: result.size,
    truncated: result.truncated,
  })
})

