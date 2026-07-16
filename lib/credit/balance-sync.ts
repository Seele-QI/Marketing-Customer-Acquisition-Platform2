/** 全局积分余额变更事件名 */
export const CREDIT_BALANCE_CHANGED_EVENT = "credit-balance-changed"

export function formatCreditPoints(value: number): string {
  return new Intl.NumberFormat("zh-CN").format(value)
}

/** 非 React 层（API 客户端、SSE 解析等）广播余额变更 */
export function notifyCreditBalanceChanged(balance: number): void {
  if (typeof window === "undefined") return
  window.dispatchEvent(
    new CustomEvent(CREDIT_BALANCE_CHANGED_EVENT, { detail: { balance } }),
  )
}

function handleSseDataPayload(
  eventType: string,
  data: string,
  onDelta: (delta: string) => void,
): "done" | "continue" {
  if (data === "[DONE]") return "done"

  if (eventType === "billing") {
    try {
      const parsed = JSON.parse(data) as { balance?: number }
      if (typeof parsed.balance === "number") {
        notifyCreditBalanceChanged(parsed.balance)
      }
    } catch {
      /* ignore malformed billing event */
    }
    return "continue"
  }

  try {
    const parsed = JSON.parse(data) as Record<string, unknown>
    const cc = parsed as { choices?: { delta?: { content?: string } }[] }
    const ccPiece = cc.choices?.[0]?.delta?.content
    if (typeof ccPiece === "string" && ccPiece.length > 0) {
      onDelta(ccPiece)
      return "continue"
    }
    if (
      parsed.type === "response.output_text.delta" &&
      typeof parsed.delta === "string" &&
      parsed.delta.length > 0
    ) {
      onDelta(parsed.delta)
    }
  } catch {
    /* skip unparseable chunks */
  }
  return "continue"
}

/** 解析 chat-stream SSE，识别 billing 事件并广播余额 */
export async function consumeBillingAwareSseStream(
  response: Response,
  onDelta: (delta: string) => void,
  signal?: AbortSignal,
): Promise<void> {
  const reader = response.body?.getReader()
  if (!reader) throw new Error("响应体不可读")

  const decoder = new TextDecoder()
  let buffer = ""
  let currentEvent = ""

  while (true) {
    if (signal?.aborted) {
      reader.cancel()
      return
    }
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""

    for (const rawLine of lines) {
      const line = rawLine.trimEnd()
      if (!line) {
        currentEvent = ""
        continue
      }
      if (line.startsWith("event:")) {
        currentEvent = line.slice(6).trim()
        continue
      }
      if (!line.startsWith("data:")) continue
      const data = line.slice(5).trim()
      const status = handleSseDataPayload(currentEvent, data, onDelta)
      if (status === "done") return
    }
  }
}
