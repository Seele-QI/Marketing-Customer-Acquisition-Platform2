import type {
  AssistantPageContext,
  BusinessAssistantReply,
  BusinessAssistantSuggestedAction,
} from "@/lib/business-assistant/types"

const SENSITIVE_KEY = /(api.?key|token|secret|password|cookie|authorization)/i

function cleanText(value: unknown, max = 500): string {
  return typeof value === "string"
    ? value.replace(/\u0000/g, "").trim().slice(0, max)
    : ""
}

function cleanRecord(
  value: unknown,
  depth = 0,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value) || depth > 1) {
    return undefined
  }
  const clean: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value).slice(0, 20)) {
    if (SENSITIVE_KEY.test(key)) continue
    const text = cleanText(raw)
    if (text) clean[key.slice(0, 80)] = text
  }
  return Object.keys(clean).length ? clean : undefined
}

export function sanitizeAssistantPageContext(
  raw: unknown,
): AssistantPageContext {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const input = raw as Record<string, unknown>
  const output: AssistantPageContext = {}
  for (const [key, value] of Object.entries(input).slice(0, 30)) {
    if (SENSITIVE_KEY.test(key)) continue
    if (key === "fields") {
      const fields = cleanRecord(value)
      if (fields) output.fields = fields
      continue
    }
    const text = cleanText(value)
    if (text) output[key] = text
  }
  return output
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  for (const candidate of [fenced, trimmed]) {
    if (!candidate) continue
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>
      }
    } catch {
      // A plain model response remains useful as text.
    }
  }
  return null
}

export function parseAssistantCompletion(
  raw: string,
  supportedViews: readonly string[],
): Pick<BusinessAssistantReply, "text" | "suggestedActions"> {
  const parsed = parseJsonObject(raw)
  if (!parsed) return { text: cleanText(raw, 20_000), suggestedActions: [] }

  const suggestedActions: BusinessAssistantSuggestedAction[] = []
  if (Array.isArray(parsed.suggestedActions)) {
    for (const item of parsed.suggestedActions.slice(0, 4)) {
      if (!item || typeof item !== "object") continue
      const action = item as Record<string, unknown>
      const label = cleanText(action.label, 40)
      if (action.type === "navigate") {
        const view = cleanText(action.view, 100)
        if (label && supportedViews.includes(view)) {
          suggestedActions.push({ type: "navigate", label, view })
        }
      }
      if (action.type === "update_plan" && Array.isArray(action.steps)) {
        const steps = action.steps
          .slice(0, 12)
          .map((step) => {
            if (!step || typeof step !== "object") return null
            const row = step as Record<string, unknown>
            const stage = cleanText(row.stage, 80)
            const title = cleanText(row.title, 200)
            const linkedView = cleanText(row.linkedView, 100)
            if (!stage || !title) return null
            return {
              stage,
              title,
              ...(supportedViews.includes(linkedView) ? { linkedView } : {}),
            }
          })
          .filter((step): step is NonNullable<typeof step> => Boolean(step))
        if (label && steps.length) {
          suggestedActions.push({ type: "update_plan", label, steps })
        }
      }
    }
  }

  return {
    text: cleanText(parsed.text, 20_000) || cleanText(raw, 20_000),
    suggestedActions,
  }
}
