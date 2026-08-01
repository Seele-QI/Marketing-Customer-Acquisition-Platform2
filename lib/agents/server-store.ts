import { getCloudApiBase } from "@/lib/fastapi-base"
import type { EvidenceItem } from "@/lib/agents/prompts"

type StoreOptions = {
  baseUrl?: string
  meteredKey?: string
  cookieHeader: string
  fetchImpl?: typeof fetch
}

export type AgentKnowledgeResult = {
  status: "loaded" | "unavailable"
  items: EvidenceItem[]
}

function runtimeOptions(input: StoreOptions) {
  return {
    base: (input.baseUrl ?? getCloudApiBase() ?? "").replace(/\/$/, ""),
    key: input.meteredKey ?? (process.env.CREDIT_METERED_KEY || "").trim(),
    fetchImpl: input.fetchImpl ?? fetch,
  }
}

async function internalJson(
  path: string,
  body: unknown,
  input: StoreOptions,
): Promise<Record<string, unknown> | null> {
  const { base, key, fetchImpl } = runtimeOptions(input)
  if (!base || !key) return null
  try {
    const response = await fetchImpl(`${base}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: input.cookieHeader,
        "X-Metered-Key": key,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok) return null
    const data = await response.json()
    return data && typeof data === "object" ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

export async function createDurableAgentRun(
  input: StoreOptions & { agentId: string; prompt: string },
): Promise<{ status: "created"; run: { id: string; revision: number } } | { status: "unavailable" }> {
  const { base, fetchImpl } = runtimeOptions(input)
  if (!base) return { status: "unavailable" }
  try {
    const response = await fetchImpl(`${base}/api/agent-team/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: input.cookieHeader },
      body: JSON.stringify({ agentId: input.agentId, prompt: input.prompt }),
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    })
    if (!response.ok) return { status: "unavailable" }
    const body = (await response.json()) as { run?: { id?: unknown; revision?: unknown } }
    if (typeof body.run?.id !== "string" || typeof body.run.revision !== "number") {
      return { status: "unavailable" }
    }
    return { status: "created", run: { id: body.run.id, revision: body.run.revision } }
  } catch {
    return { status: "unavailable" }
  }
}

export async function updateDurableAgentRun(
  input: StoreOptions & {
    runId: string
    revision: number
    status: string
    result?: Record<string, unknown>
  },
): Promise<{ ok: boolean; revision?: number }> {
  const data = await internalJson(
    `/api/agent-team/runs/${encodeURIComponent(input.runId)}`,
    { revision: input.revision, status: input.status, result: input.result ?? {} },
    { ...input, fetchImpl: async (url, init) => (input.fetchImpl ?? fetch)(url, { ...init, method: "PATCH" }) },
  )
  const run = data?.run
  return run && typeof run === "object" && typeof (run as Record<string, unknown>).revision === "number"
    ? { ok: true, revision: (run as Record<string, number>).revision }
    : { ok: false }
}

export async function appendDurableAgentEvent(
  input: StoreOptions & { runId: string; eventType: string; payload: Record<string, unknown> },
): Promise<boolean> {
  const data = await internalJson(
    `/api/agent-team/runs/${encodeURIComponent(input.runId)}/events`,
    { eventType: input.eventType, payload: input.payload },
    input,
  )
  return Boolean(data?.event)
}

function sanitizeKnowledgeItem(value: unknown): EvidenceItem | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  if (typeof row.text !== "string" || !row.text.trim()) return null
  const name = typeof row.name === "string" ? row.name.slice(0, 200) : "企业知识库"
  const scope = typeof row.scope === "string" ? row.scope.slice(0, 40) : "company"
  return { source: `${scope}:${name}`, text: row.text.slice(0, 4000) }
}

export async function retrieveAgentKnowledge(
  input: StoreOptions & {
    query: string
    runId: string
    departmentIds: string[]
  },
): Promise<AgentKnowledgeResult> {
  const { base, key } = runtimeOptions(input)
  if (!base || !key) return { status: "unavailable", items: [] }
  const requests = [
    { query: input.query, scope: "company", limit: 4 },
    { query: input.query, scope: "task", taskId: input.runId, limit: 4 },
    ...[...new Set(input.departmentIds)].slice(0, 4).map((departmentId) => ({
      query: input.query,
      scope: "department",
      departmentId,
      limit: 4,
    })),
  ]
  const responses = await Promise.all(
    requests.map((body) => internalJson("/api/agent-team/knowledge/search", body, input)),
  )
  if (responses.every((response) => response === null)) {
    return { status: "unavailable", items: [] }
  }
  const items = responses
    .flatMap((response) => (Array.isArray(response?.items) ? response.items : []))
    .map(sanitizeKnowledgeItem)
    .filter((item): item is EvidenceItem => item !== null)
    .slice(0, 12)
  return { status: "loaded", items }
}

