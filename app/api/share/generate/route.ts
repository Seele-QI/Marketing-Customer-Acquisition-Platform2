import { NextResponse } from "next/server"
import { cleanTags, saveShareRecord } from "@/lib/share-store"

export const runtime = "nodejs"

type ShareGenerateBody = {
  videoUrl?: string
  title?: string
  description?: string
  tags?: string[]
}

export async function POST(req: Request) {
  let body: ShareGenerateBody
  try {
    body = (await req.json()) as ShareGenerateBody
  } catch {
    return NextResponse.json({ detail: "请求体无效" }, { status: 400 })
  }

  const videoUrl = String(body.videoUrl ?? "").trim()
  const title = String(body.title ?? "").trim()
  const description = String(body.description ?? "")
  const tags = cleanTags(body.tags)

  if (!videoUrl) {
    return NextResponse.json({ detail: "videoUrl 不能为空" }, { status: 400 })
  }
  if (!title) {
    return NextResponse.json({ detail: "title 不能为空" }, { status: 400 })
  }
  if (videoUrl.length > 2048) {
    return NextResponse.json({ detail: "videoUrl 超出长度上限" }, { status: 400 })
  }
  if (title.length > 80) {
    return NextResponse.json({ detail: "title 超出长度上限" }, { status: 400 })
  }
  if (description.length > 2000) {
    return NextResponse.json({ detail: "description 超出长度上限" }, { status: 400 })
  }

  const token = saveShareRecord({ videoUrl, title, description, tags })
  const origin = new URL(req.url).origin
  const shareUrl = `${origin}/api/share/${token}`

  return NextResponse.json({ share_token: token, share_url: shareUrl })
}
