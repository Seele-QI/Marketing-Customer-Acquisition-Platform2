import { getCloudApiBase } from "@/lib/fastapi-base"

export type MemoryMetadataItem = {
  id: string
  scope: string
  category: string
  memoryKey: string
  value: string | string[]
  revision: number
}

export type MemoryRetrievalResult = {
  status: "loaded" | "unavailable"
  count: number
  context: string
  items: MemoryMetadataItem[]
}

const EMPTY_UNAVAILABLE: MemoryRetrievalResult = {
  status: "unavailable",
  count: 0,
  context: "",
  items: [],
}

function sanitizeItems(raw: unknown): MemoryMetadataItem[] {
  if (!Array.isArray(raw)) return []
  const items: MemoryMetadataItem[] = []
  for (const candidate of raw.slice(0, 12)) {
    if (!candidate || typeof candidate !== "object") continue
    const row = candidate as Record<string, unknown>
    const value = row.value
    if (
      typeof row.id !== "string" ||
      typeof row.scope !== "string" ||
      typeof row.category !== "string" ||
      typeof row.memoryKey !== "string" ||
      typeof row.revision !== "number" ||
      !(
        typeof value === "string" ||
        (Array.isArray(value) && value.every((part) => typeof part === "string"))
      )
    ) {
      continue
    }
    items.push({
      id: row.id.slice(0, 100),
      scope: row.scope.slice(0, 40),
      category: row.category.slice(0, 40),
      memoryKey: row.memoryKey.slice(0, 80),
      value: typeof value === "string" ? value.slice(0, 1000) : value.slice(0, 20).map((part) => part.slice(0, 500)),
      revision: row.revision,
    })
  }
  return items
}

export async function retrieveServerMemory(input: {
  cookieHeader: string
  scope: "copywriting" | "positioning" | "video" | "geo"
  agentName: string
  query: string
  fetchImpl?: typeof fetch
}): Promise<MemoryRetrievalResult> {
  const base = getCloudApiBase()
  const meteredKey = (process.env.CREDIT_METERED_KEY || "").trim()
  if (!base || !meteredKey) return EMPTY_UNAVAILABLE

  try {
    const response = await (input.fetchImpl ?? fetch)(`${base}/api/memory/retrieve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: input.cookieHeader,
        "X-Metered-Key": meteredKey,
      },
      body: JSON.stringify({
        scope: input.scope,
        agentName: input.agentName.slice(0, 120),
        query: input.query.slice(0, 12_000),
        maxItems: 12,
        maxChars: 3000,
      }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok) return EMPTY_UNAVAILABLE
    const body = (await response.json()) as Record<string, unknown>
    const items = sanitizeItems(body.items)
    const context = typeof body.context === "string" ? body.context.slice(0, 3000) : ""
    return {
      status: "loaded",
      count: items.length,
      context,
      items,
    }
  } catch {
    return EMPTY_UNAVAILABLE
  }
}
