import { getCloudApiBase } from "@/lib/fastapi-base"

import type {
  BusinessAssistantMessage,
  BusinessProjectDetail,
  EnabledBusinessAssistantId,
} from "@/lib/business-assistant/types"

export type ServerBusinessProjectResult =
  | { status: "loaded"; detail: BusinessProjectDetail }
  | { status: "not_found" | "unavailable" }

export async function loadBusinessProjectServer(input: {
  cookieHeader: string
  projectId: string
  fetchImpl?: typeof fetch
}): Promise<ServerBusinessProjectResult> {
  const base = getCloudApiBase()
  if (!base || !input.projectId.trim()) return { status: "unavailable" }
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${base}/api/business-assistant/projects/${encodeURIComponent(input.projectId)}`,
      {
        headers: { Cookie: input.cookieHeader },
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (response.status === 404) return { status: "not_found" }
    if (!response.ok) return { status: "unavailable" }
    return {
      status: "loaded",
      detail: (await response.json()) as BusinessProjectDetail,
    }
  } catch {
    return { status: "unavailable" }
  }
}

export async function appendBusinessAssistantMessageServer(input: {
  cookieHeader: string
  projectId: string
  assistantId: EnabledBusinessAssistantId
  role: "user" | "assistant" | "system"
  content: string
  metadata?: Record<string, unknown>
  fetchImpl?: typeof fetch
}): Promise<BusinessAssistantMessage | null> {
  const base = getCloudApiBase()
  if (!base) return null
  try {
    const response = await (input.fetchImpl ?? fetch)(
      `${base}/api/business-assistant/projects/${encodeURIComponent(input.projectId)}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: input.cookieHeader,
        },
        body: JSON.stringify({
          assistantId: input.assistantId,
          role: input.role,
          content: input.content,
          metadata: input.metadata ?? {},
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!response.ok) return null
    const body = (await response.json()) as {
      message?: BusinessAssistantMessage
    }
    return body.message ?? null
  } catch {
    return null
  }
}
