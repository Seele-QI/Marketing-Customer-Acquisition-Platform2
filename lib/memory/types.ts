export type MemoryScope =
  | "global"
  | "copywriting"
  | "positioning"
  | "video"
  | "geo"
export type MemoryCategory = "identity" | "business" | "goal" | "preference" | "constraint" | "fact"
export type MemoryStatus = "active" | "superseded" | "disabled" | "deleted"
export type MemorySource = "extracted" | "manual" | "legacy"
export type MemorySyncStatus = "idle" | "syncing" | "synced" | "stale" | "error" | "disabled" | "signed_out"

export type UserMemoryItem = {
  id: string
  scope: MemoryScope
  category: MemoryCategory
  memoryKey: string
  value: string | string[]
  status: MemoryStatus
  source: MemorySource
  confidence: number
  strength: number
  pinned: boolean
  revision: number
  firstSeenAt: number
  lastConfirmedAt: number
  createdAt: number
  updatedAt: number
}

export type UserMemorySummary = {
  total: number
  byScope: Record<string, number>
  byCategory: Record<string, number>
}

export type UserMemorySettings = {
  enabled: boolean
  scopeEnabled: Record<string, boolean>
  legacyImportedAt?: number | null
  updatedAt: number
}

export type UserMemoryEvent = {
  id: number
  itemId: string
  eventType: string
  oldValue: unknown
  newValue: unknown
  metadata: Record<string, unknown>
  createdAt: number
}

export type UserMemorySnapshot = {
  items: UserMemoryItem[]
  summary: UserMemorySummary
  settings: UserMemorySettings
  syncStatus: MemorySyncStatus
  syncedAt: number | null
  error?: string
}
