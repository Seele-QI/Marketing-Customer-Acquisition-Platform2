"use client"

import * as React from "react"

import { createUserMemoryClient, migrateLegacyMemory } from "@/lib/memory/client"
import type {
  MemoryScope,
  MemoryStatus,
  UserMemoryItem,
  UserMemorySettings,
  UserMemorySnapshot,
} from "@/lib/memory/types"

export const USER_MEMORY_UPDATED_EVENT = "user-memory-updated"

const client = createUserMemoryClient()

const EMPTY: UserMemorySnapshot = {
  items: [],
  summary: { total: 0, byScope: {}, byCategory: {} },
  settings: {
    enabled: true,
    scopeEnabled: { global: true, copywriting: true, positioning: true, geo: true },
    updatedAt: 0,
  },
  syncStatus: "idle",
  syncedAt: null,
}

function announceUpdate(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(USER_MEMORY_UPDATED_EVENT))
}

export function useUserMemory() {
  const [snapshot, setSnapshot] = React.useState<UserMemorySnapshot>(() => client.readCached() ?? EMPTY)

  const refresh = React.useCallback(async () => {
    setSnapshot((current) => ({ ...current, syncStatus: "syncing" }))
    const next = await client.refresh()
    setSnapshot(next)
    return next
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      await migrateLegacyMemory()
      if (!cancelled) await refresh()
    })()
    const onUpdate = () => void refresh()
    window.addEventListener(USER_MEMORY_UPDATED_EVENT, onUpdate)
    window.addEventListener("focus", onUpdate)
    return () => {
      cancelled = true
      window.removeEventListener(USER_MEMORY_UPDATED_EVENT, onUpdate)
      window.removeEventListener("focus", onUpdate)
    }
  }, [refresh])

  const mutate = React.useCallback(async <T,>(operation: () => Promise<T>) => {
    const result = await operation()
    announceUpdate()
    return result
  }, [])

  return {
    ...snapshot,
    refresh,
    async updateItem(id: string, revision: number, patch: { value?: string | string[]; pinned?: boolean }) {
      return mutate(() => client.updateItem(id, revision, patch))
    },
    async setItemStatus(id: string, revision: number, status: "active" | "disabled") {
      return mutate(() => client.setItemStatus(id, revision, status))
    },
    async deleteItem(id: string, revision: number) {
      return mutate(() => client.deleteItem(id, revision))
    },
    async clearAll() {
      return mutate(() => client.clearAll())
    },
    async updateSettings(patch: Partial<Pick<UserMemorySettings, "enabled" | "scopeEnabled">>) {
      return mutate(() => client.updateSettings(patch))
    },
    observeUserTurn: client.observeUserTurn,
    async listItems(scope?: MemoryScope, status?: MemoryStatus): Promise<UserMemoryItem[]> {
      return client.listItems(scope, status)
    },
  }
}
