import type {
  MemoryScope,
  MemoryStatus,
  UserMemoryEvent,
  UserMemoryItem,
  UserMemorySettings,
  UserMemorySnapshot,
  UserMemorySummary,
} from "@/lib/memory/types"
import { parseApiErrorResponse } from "@/lib/api/parse-detail"

export const MEMORY_CACHE_KEY = "account-user-memory-cache-v1"
export const LEGACY_MEMORY_KEY = "copywriting-user-memory-v1"

const EMPTY_SUMMARY: UserMemorySummary = { total: 0, byScope: {}, byCategory: {} }
const DEFAULT_SETTINGS: UserMemorySettings = {
  enabled: true,
  scopeEnabled: {
    global: true,
    copywriting: true,
    positioning: true,
    video: true,
    geo: true,
  },
  updatedAt: 0,
}

type ClientOptions = {
  fetchImpl?: typeof fetch
  storage?: Storage
  now?: () => number
}

class MemoryApiError extends Error {
  readonly code: string | undefined
  readonly status: number

  constructor(message: string, code: string | undefined, status: number) {
    super(message)
    this.name = "MemoryApiError"
    this.code = code
    this.status = status
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: { code?: string; message?: string } }
    const code = typeof payload.detail?.code === "string" ? payload.detail.code : undefined
    throw new MemoryApiError(
      parseApiErrorResponse(response.status, { detail: payload.detail }, "请求暂时未完成，请稍后重试。"),
      code,
      response.status,
    )
  }
  return response.json() as Promise<T>
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage
  } catch {
    return undefined
  }
}

function readCache(storage?: Storage): UserMemorySnapshot | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(MEMORY_CACHE_KEY)
    return raw ? JSON.parse(raw) as UserMemorySnapshot : null
  } catch {
    return null
  }
}

function writeCache(storage: Storage | undefined, snapshot: UserMemorySnapshot): void {
  if (!storage) return
  try {
    storage.setItem(MEMORY_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    /* cache is optional */
  }
}

function clearCache(storage?: Storage): void {
  if (!storage) return
  try {
    storage.removeItem(MEMORY_CACHE_KEY)
  } catch {
    /* cache is optional */
  }
}

export function createUserMemoryClient(options: ClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch
  const storage = options.storage ?? browserStorage()
  const now = options.now ?? Date.now

  const request = async <T>(url: string, init?: RequestInit): Promise<T> => {
    const response = await fetchImpl(url, {
      credentials: "include",
      ...init,
      headers: init?.body
        ? { "Content-Type": "application/json", ...init.headers }
        : init?.headers,
    })
    return parseJson<T>(response)
  }

  return {
    async listItems(scope?: MemoryScope, status: MemoryStatus = "active"): Promise<UserMemoryItem[]> {
      const params = new URLSearchParams()
      if (scope) params.set("scope", scope)
      params.set("status", status)
      const body = await request<{ items: UserMemoryItem[] }>(`/api/memory?${params}`)
      return Array.isArray(body.items) ? body.items : []
    },

    async getSummary(): Promise<UserMemorySummary> {
      return (await request<{ summary: UserMemorySummary }>("/api/memory/summary")).summary
    },

    async getSettings(): Promise<UserMemorySettings> {
      return (await request<{ settings: UserMemorySettings }>("/api/memory/settings")).settings
    },

    async getEvents(): Promise<UserMemoryEvent[]> {
      return (await request<{ events: UserMemoryEvent[] }>("/api/memory/events")).events
    },

    async updateItem(
      id: string,
      revision: number,
      patch: { value?: string | string[]; pinned?: boolean },
    ): Promise<UserMemoryItem> {
      return (
        await request<{ item: UserMemoryItem }>(`/api/memory/items/${encodeURIComponent(id)}`, {
          method: "PATCH",
          body: JSON.stringify({ revision, ...patch }),
        })
      ).item
    },

    async setItemStatus(
      id: string,
      revision: number,
      status: "active" | "disabled",
    ): Promise<UserMemoryItem> {
      return (
        await request<{ item: UserMemoryItem }>(
          `/api/memory/items/${encodeURIComponent(id)}/status`,
          { method: "POST", body: JSON.stringify({ revision, status }) },
        )
      ).item
    },

    async deleteItem(id: string, revision: number): Promise<UserMemoryItem> {
      return (
        await request<{ item: UserMemoryItem }>(
          `/api/memory/items/${encodeURIComponent(id)}?revision=${revision}`,
          { method: "DELETE" },
        )
      ).item
    },

    async clearAll(): Promise<number> {
      return (await request<{ deleted: number }>("/api/memory/clear", { method: "POST" })).deleted
    },

    async updateSettings(patch: Partial<Pick<UserMemorySettings, "enabled" | "scopeEnabled">>) {
      return (
        await request<{ settings: UserMemorySettings }>("/api/memory/settings", {
          method: "PATCH",
          body: JSON.stringify(patch),
        })
      ).settings
    },

    async observeUserTurn(input: {
      scope: Exclude<MemoryScope, "global">
      sessionId: string
      messageId: string
      userMessage: string
    }): Promise<{ status: string; updated: number }> {
      return request("/api/ai/memory-extract", {
        method: "POST",
        keepalive: true,
        body: JSON.stringify(input),
      })
    },

    readCached(): UserMemorySnapshot | null {
      return readCache(storage)
    },

    async refresh(): Promise<UserMemorySnapshot> {
      try {
        const [items, summary, settings] = await Promise.all([
          this.listItems(undefined, "active"),
          this.getSummary(),
          this.getSettings(),
        ])
        const snapshot: UserMemorySnapshot = {
          items,
          summary,
          settings,
          syncStatus: settings.enabled ? "synced" : "disabled",
          syncedAt: now(),
        }
        writeCache(storage, snapshot)
        return snapshot
      } catch (error) {
        if (error instanceof MemoryApiError && error.code === "NOT_LOGGED_IN") {
          clearCache(storage)
          return {
            items: [],
            summary: EMPTY_SUMMARY,
            settings: DEFAULT_SETTINGS,
            syncStatus: "signed_out",
            syncedAt: null,
          }
        }
        const cached = readCache(storage)
        if (cached) return { ...cached, syncStatus: "stale" }
        return {
          items: [],
          summary: EMPTY_SUMMARY,
          settings: DEFAULT_SETTINGS,
          syncStatus: "error",
          syncedAt: null,
          error: error instanceof Error ? error.message : "MEMORY_SYNC_FAILED",
        }
      }
    },
  }
}

export async function migrateLegacyMemory(options: {
  storage?: Storage
  fetchImpl?: typeof fetch
} = {}): Promise<{ migrated: boolean; imported: number }> {
  const storage = options.storage ?? browserStorage()
  if (!storage) return { migrated: false, imported: 0 }
  let raw: string | null
  try {
    raw = storage.getItem(LEGACY_MEMORY_KEY)
  } catch {
    return { migrated: false, imported: 0 }
  }
  if (!raw) return { migrated: false, imported: 0 }

  try {
    const memory = JSON.parse(raw) as Record<string, unknown>
    const response = await (options.fetchImpl ?? fetch)("/api/memory/import-legacy", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memory }),
    })
    if (!response.ok) return { migrated: false, imported: 0 }
    const result = await response.json() as { imported?: number }
    storage.removeItem(LEGACY_MEMORY_KEY)
    return { migrated: true, imported: Number(result.imported || 0) }
  } catch {
    return { migrated: false, imported: 0 }
  }
}

export type UserMemoryClient = ReturnType<typeof createUserMemoryClient>
