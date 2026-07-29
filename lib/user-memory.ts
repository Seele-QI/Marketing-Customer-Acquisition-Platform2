/** Legacy device-local memory adapter.
 *
 * New runtime code must use `lib/memory/client.ts`.  This module only exists
 * so the one-time account migration can inspect or remove the v1 payload.
 */
export const LEGACY_USER_MEMORY_STORAGE_KEY = "copywriting-user-memory-v1"

export type LegacyUserMemory = {
  industry: string
  role: string
  goals: string[]
  preferences: string[]
  facts: string[]
  lastUpdated: string
}

export function readLegacyUserMemory(storage?: Storage): LegacyUserMemory | null {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage)
  if (!target) return null
  try {
    const raw = target.getItem(LEGACY_USER_MEMORY_STORAGE_KEY)
    return raw ? JSON.parse(raw) as LegacyUserMemory : null
  } catch {
    return null
  }
}

export function removeLegacyUserMemory(storage?: Storage): void {
  const target = storage ?? (typeof window === "undefined" ? undefined : window.localStorage)
  if (!target) return
  try {
    target.removeItem(LEGACY_USER_MEMORY_STORAGE_KEY)
  } catch {
    /* migration will retry if storage is unavailable */
  }
}
