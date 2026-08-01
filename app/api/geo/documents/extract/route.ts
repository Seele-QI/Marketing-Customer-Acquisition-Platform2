import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { extractDocumentText } from "@/lib/server/document-extract"
import {
  isSupportedDocumentName,
  MAX_DOCUMENT_BYTES,
} from "@/lib/ip-positioning-upload"

export const runtime = "nodejs"

type ExtractBody = {
  name?: string
  type?: string
  size?: number
  base64?: string
}

export const POST = withAuth(async (req) => {
  try {
    const body = (await req.json()) as ExtractBody
    const name = String(body.name ?? "").trim()
    const type = String(body.type ?? "application/octet-stream")
    const size = Number(body.size ?? 0)
    const base64 = String(body.base64 ?? "").trim()

    if (!name || !base64) {
      return NextResponse.json({ error: "缺少文件内容" }, { status: 400 })
    }
    if (!isSupportedDocumentName(name)) {
      return NextResponse.json(
        { error: "暂不支持该格式，请上传 Word / PDF / TXT / MD / CSV / XLSX / PPTX" },
        { status: 400 },
      )
    }
    if (!Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "无效的文件大小" }, { status: 400 })
    }
    if (size > MAX_DOCUMENT_BYTES) {
      return NextResponse.json({ error: "文件超过 20MB 限制" }, { status: 400 })
    }

    const doc = await extractDocumentText({ name, type, size, base64 })
    if (doc.error || !doc.text.trim()) {
      return NextResponse.json(
        { error: doc.error || "未能提取有效正文" },
        { status: 422 },
      )
    }

    return NextResponse.json({
      name: doc.name,
      size: doc.size,
      text: doc.text,
      truncated: doc.truncated,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
})
