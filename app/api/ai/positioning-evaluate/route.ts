import { NextResponse } from "next/server"

import { deepseekChatCompletion } from "@/lib/deepseek-chat"

type Body = {
  stageId?: string | null
  stageTitle?: string
  stageEffectHint?: string
  archiveTitle?: string
  archiveKind?: string
  dialogueContext?: string
}

const MAX_CONTEXT = 48_000

/**
 * 身份定位页：结合「当前阶段」与一条历史对话，由 DeepSeek 输出评估（密钥仅服务端）。
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const dialogueContext = String(body.dialogueContext ?? "").trim().slice(0, MAX_CONTEXT)
  if (!dialogueContext) {
    return NextResponse.json({ detail: "缺少对话内容，无法评估" }, { status: 400 })
  }

  const stageTitle = typeof body.stageTitle === "string" ? body.stageTitle.trim().slice(0, 80) : ""
  const stageEffectHint =
    typeof body.stageEffectHint === "string" ? body.stageEffectHint.trim().slice(0, 500) : ""
  const archiveTitle = typeof body.archiveTitle === "string" ? body.archiveTitle.trim().slice(0, 200) : "未命名记录"
  const archiveKind = typeof body.archiveKind === "string" ? body.archiveKind.trim().slice(0, 40) : ""

  const stageBlock =
    stageTitle && stageEffectHint
      ? `用户自评阶段：「${stageTitle}」。该阶段策略侧重：${stageEffectHint}`
      : stageTitle
        ? `用户自评阶段：「${stageTitle}」。`
        : "用户未在页面选择成长阶段，请用通用「超级个体 / 内容创业」视角评估。"

  const system = [
    "你是资深「身份定位与超级个体」商业顾问，擅长诊断人设清晰度、内容方向与变现路径。",
    "请基于用户给出的「成长阶段」与「一条或多条已保存的对话记录（可能分多段粘贴）」做综合评估；若有多条，请比较异同、提炼共性并给出统一建议。",
    "输出结构：① 总体判断（2–4 句）② 亮点与已对齐点（条列）③ 风险或缺口（条列）④ 可执行的下一步建议（3–5 条，具体可落地）。",
    "语气专业、直接；避免空话；总字数建议 600–1200 字。使用 Markdown 小标题与条列。",
  ].join("\n")

  const userContent = [
    stageBlock,
    `记录类型：${archiveKind || "未知"}`,
    `记录标题：${archiveTitle}`,
    "",
    "—— 以下为对话原文 ——",
    dialogueContext,
  ].join("\n")

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ report: result.text.trim() })
}
