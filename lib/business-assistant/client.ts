import { parseApiErrorResponse } from "@/lib/api/parse-detail"

import type {
  BusinessProject,
  BusinessProjectDetail,
  BusinessProjectKind,
  BusinessProjectStatus,
  BusinessAssistantReply,
  AssistantPageContext,
  EnabledBusinessAssistantId,
} from "@/lib/business-assistant/types"

type ClientOptions = {
  fetchImpl?: typeof fetch
}

export class BusinessAssistantApiError extends Error {
  readonly code: string | undefined
  readonly status: number

  constructor(message: string, code: string | undefined, status: number) {
    super(message)
    this.name = "BusinessAssistantApiError"
    this.code = code
    this.status = status
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      detail?: string | { code?: string; message?: string }
    }
    const structured =
      payload.detail && typeof payload.detail === "object"
        ? payload.detail
        : undefined
    const message =
      structured?.message ||
      (typeof payload.detail === "string" ? payload.detail : "") ||
      parseApiErrorResponse(
        response.status,
        payload as Record<string, unknown>,
        "业务项目请求暂时未完成，请稍后重试。",
      )
    throw new BusinessAssistantApiError(
      message,
      structured?.code,
      response.status,
    )
  }
  return response.json() as Promise<T>
}

export function createBusinessAssistantClient(options: ClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch

  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const method = (init?.method || "GET").toUpperCase()
    const retryable = method === "GET"
    const maxAttempts = retryable ? 3 : 1
    const timeoutMs = url.endsWith("/chat") ? 130_000 : 15_000
    let lastError: unknown

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), timeoutMs)
      const forwardAbort = () => controller.abort()
      init?.signal?.addEventListener("abort", forwardAbort, { once: true })
      try {
        const response = await fetchImpl(url, {
          credentials: "include",
          cache: "no-store",
          ...init,
          signal: controller.signal,
          headers: init?.body
            ? { "Content-Type": "application/json", ...init.headers }
            : init?.headers,
        })
        if (retryable && attempt < maxAttempts && [502, 503, 504].includes(response.status)) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
          continue
        }
        return await parseJson<T>(response)
      } catch (caught) {
        lastError = caught
        if (
          !retryable
          || attempt >= maxAttempts
          || (caught instanceof BusinessAssistantApiError && caught.status < 500)
        ) {
          throw caught
        }
        await new Promise((resolve) => setTimeout(resolve, 250 * attempt))
      } finally {
        clearTimeout(timeout)
        init?.signal?.removeEventListener("abort", forwardAbort)
      }
    }
    throw lastError instanceof Error ? lastError : new Error("业务项目请求失败")
  }

  return {
    async listProjects(filters: {
      kind?: BusinessProjectKind
      status?: BusinessProjectStatus
    } = {}): Promise<BusinessProject[]> {
      const params = new URLSearchParams()
      if (filters.kind) params.set("kind", filters.kind)
      if (filters.status) params.set("status", filters.status)
      const suffix = params.size ? `?${params.toString()}` : ""
      const body = await request<{ projects: BusinessProject[] }>(
        `/api/business-assistant/projects${suffix}`,
      )
      return Array.isArray(body.projects) ? body.projects : []
    },

    async createProject(input: {
      kind: BusinessProjectKind
      title: string
      goal: string
      assistantId: EnabledBusinessAssistantId
    }): Promise<BusinessProject> {
      return (
        await request<{ project: BusinessProject }>(
          "/api/business-assistant/projects",
          { method: "POST", body: JSON.stringify(input) },
        )
      ).project
    },

    async getProject(projectId: string): Promise<BusinessProjectDetail> {
      return request(
        `/api/business-assistant/projects/${encodeURIComponent(projectId)}`,
      )
    },

    async updateProject(
      projectId: string,
      revision: number,
      patch: Partial<
        Pick<
          BusinessProject,
          "title" | "goal" | "status" | "currentStage"
        >
      >,
    ): Promise<BusinessProject> {
      return (
        await request<{ project: BusinessProject }>(
          `/api/business-assistant/projects/${encodeURIComponent(projectId)}`,
          {
            method: "PATCH",
            body: JSON.stringify({ revision, ...patch }),
          },
        )
      ).project
    },

    async replaceSteps(
      projectId: string,
      revision: number,
      steps: Array<{
        stage: string
        title: string
        status: "pending" | "active" | "blocked" | "completed"
        orderIndex: number
        linkedView?: string
      }>,
    ): Promise<BusinessProject> {
      return (
        await request<{ project: BusinessProject }>(
          `/api/business-assistant/projects/${encodeURIComponent(projectId)}/steps`,
          {
            method: "PUT",
            body: JSON.stringify({ revision, steps }),
          },
        )
      ).project
    },

    async sendMessage(input: {
      projectId: string
      assistantId: EnabledBusinessAssistantId
      message: string
      pageContext?: AssistantPageContext
    }): Promise<BusinessAssistantReply> {
      return request("/api/business-assistant/chat", {
        method: "POST",
        body: JSON.stringify(input),
      })
    },
  }
}

export type BusinessAssistantClient = ReturnType<
  typeof createBusinessAssistantClient
>
