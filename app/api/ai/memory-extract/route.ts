import { NextResponse } from "next/server"
import { deepseekChatCompletion } from "@/lib/deepseek-chat"

export const maxDuration = 60

const MEMORY_EXTRACT_SYSTEM = `你是一个信息提取助手。你的任务是从对话中提取用户的关键信息。

请从以下对话中提取用户信息，返回 JSON 格式：
{
  "industry": "用户所在的行业/赛道（如：互联网运营、装修设计、教育培训）",
  "role": "用户的角色/职位（如：运营总监、室内设计师、英语老师）",
  "goals": ["用户的创作/商业目标"],
  "preferences": ["用户偏好的平台、内容风格、形式等"],
  "facts": ["关于用户的其他关键事实"]
}

规则：
- 只提取用户明确提到的信息，不要推测
- 如果某项没有足够信息，用空字符串或空数组
- industry 和 role 用中文简短描述
- 每个数组最多 3 项，只保留最核心的
- 返回纯 JSON，不要包含 markdown 代码块`

type Body = {
  messages?: { role: string; content: string }[]
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const raw = Array.isArray(body.messages) ? body.messages : []
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content ?? "").trim().slice(0, 8000),
    }))
    .filter((m) => m.content.length > 0)

  if (messages.length === 0) {
    return NextResponse.json({ detail: "缺少有效对话内容" }, { status: 400 })
  }

  // Take the last 6 messages to keep context focused
  const recentMessages = messages.slice(-6)

  const conversationText = recentMessages
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n\n")

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: MEMORY_EXTRACT_SYSTEM },
      { role: "user", content: `请从以下对话中提取用户信息：\n\n${conversationText}` },
    ],
    30_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  // Parse the JSON response
  let extracted: {
    industry?: string
    role?: string
    goals?: string[]
    preferences?: string[]
    facts?: string[]
  }
  try {
    // Strip potential markdown code blocks
    const jsonStr = result.text.replace(/```(?:json)?\s*/g, "").replace(/```\s*/g, "").trim()
    extracted = JSON.parse(jsonStr) as typeof extracted
  } catch {
    return NextResponse.json(
      { detail: "AI 返回格式异常，未包含有效 JSON", raw: result.text.slice(0, 200) },
      { status: 502 },
    )
  }

  return NextResponse.json({
    industry: typeof extracted.industry === "string" ? extracted.industry.trim() : "",
    role: typeof extracted.role === "string" ? extracted.role.trim() : "",
    goals: Array.isArray(extracted.goals) ? extracted.goals.filter((g): g is string => typeof g === "string").slice(0, 3) : [],
    preferences: Array.isArray(extracted.preferences) ? extracted.preferences.filter((p): p is string => typeof p === "string").slice(0, 3) : [],
    facts: Array.isArray(extracted.facts) ? extracted.facts.filter((f): f is string => typeof f === "string").slice(0, 3) : [],
  })
}
