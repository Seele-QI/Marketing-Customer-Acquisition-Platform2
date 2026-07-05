import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import type {
  BatchGenerateEvent,
  BatchGenerateRequest,
  GeneratedArticle,
} from "@/lib/geo/article-types"

export type BatchGenerateHandlers = {
  onEvent?: (event: BatchGenerateEvent) => void
  onArticle?: (article: GeneratedArticle) => void
}

function parseSseLine(line: string): BatchGenerateEvent | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith("data:")) return null
  const json = trimmed.slice(5).trim()
  if (!json) return null
  try {
    return JSON.parse(json) as BatchGenerateEvent
  } catch {
    return null
  }
}

/** 启动批量 GEO 文章生成（SSE 单连接） */
export async function startBatchGenerate(
  body: BatchGenerateRequest,
  handlers: BatchGenerateHandlers = {},
): Promise<{ successCount: number; failCount: number }> {
  const resp = await fetch("/api/geo/articles/batch-generate", {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    let data: { detail?: unknown; error?: string }
    try {
      data = (await resp.json()) as { detail?: unknown; error?: string }
    } catch {
      throw new Error(`批量生成失败（HTTP ${resp.status}）`)
    }
    throw new Error(parseApiErrorResponse(resp.status, data, "批量生成失败"))
  }

  const reader = resp.body?.getReader()
  if (!reader) {
    throw new Error("服务端未返回流式响应")
  }

  const decoder = new TextDecoder()
  let buffer = ""
  let successCount = 0
  let failCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const parts = buffer.split("\n\n")
    buffer = parts.pop() ?? ""

    for (const part of parts) {
      for (const line of part.split("\n")) {
        const event = parseSseLine(line)
        if (!event) continue
        handlers.onEvent?.(event)
        if (event.type === "job_done") {
          successCount += 1
          handlers.onArticle?.(event.article)
        } else if (event.type === "job_error" && event.jobId !== "batch") {
          failCount += 1
        } else if (event.type === "batch_complete") {
          successCount = event.successCount
          failCount = event.failCount
        }
      }
    }
  }

  return { successCount, failCount }
}
