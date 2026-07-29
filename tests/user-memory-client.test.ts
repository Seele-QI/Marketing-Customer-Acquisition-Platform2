import assert from "node:assert/strict"
import test from "node:test"

import {
  MEMORY_CACHE_KEY,
  createUserMemoryClient,
  migrateLegacyMemory,
} from "../lib/memory/client.ts"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status })
}

test("typed client covers list, summary, edit, status, delete, clear, settings, and events", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const client = createUserMemoryClient({
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === "/api/memory?scope=copywriting&status=active") return json({ items: [] })
      if (url === "/api/memory/summary") return json({ summary: { total: 0, byScope: {}, byCategory: {} } })
      if (url === "/api/memory/settings" && (!init?.method || init.method === "GET")) {
        return json({ settings: { enabled: true, scopeEnabled: { copywriting: true }, updatedAt: 1 } })
      }
      if (url === "/api/memory/events") return json({ events: [] })
      if (url === "/api/memory/items/m1" && init?.method === "PATCH") return json({ item: { id: "m1" } })
      if (url === "/api/memory/items/m1/status") return json({ item: { id: "m1", status: "disabled" } })
      if (url === "/api/memory/items/m1?revision=3" && init?.method === "DELETE") return json({ item: { id: "m1" } })
      if (url === "/api/memory/clear") return json({ deleted: 1 })
      if (url === "/api/memory/settings" && init?.method === "PATCH") return json({ settings: { enabled: false } })
      throw new Error(`unexpected ${url}`)
    },
  })

  await client.listItems("copywriting", "active")
  await client.getSummary()
  await client.getSettings()
  await client.getEvents()
  await client.updateItem("m1", 2, { value: "新值", pinned: true })
  await client.setItemStatus("m1", 3, "disabled")
  await client.deleteItem("m1", 3)
  await client.clearAll()
  await client.updateSettings({ enabled: false })

  assert.equal(calls.length, 9)
  assert.deepEqual(JSON.parse(String(calls[4].init?.body)), {
    revision: 2,
    value: "新值",
    pinned: true,
  })
  assert.deepEqual(JSON.parse(String(calls[5].init?.body)), { revision: 3, status: "disabled" })
})

test("refresh writes an explicit synced cache and failed refresh returns stale cache", async () => {
  const storage = new MemoryStorage()
  let online = true
  const client = createUserMemoryClient({
    storage,
    now: () => 12345,
    fetchImpl: async (input) => {
      if (!online) throw new Error("offline")
      const url = String(input)
      if (url.startsWith("/api/memory?")) {
        return json({
          items: [
            {
              id: "m1",
              scope: "global",
              category: "business",
              memoryKey: "industry",
              value: "装修设计",
              status: "active",
              source: "manual",
              confidence: 1,
              strength: 1,
              pinned: false,
              revision: 1,
              firstSeenAt: 1,
              lastConfirmedAt: 1,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        })
      }
      if (url === "/api/memory/summary") return json({ summary: { total: 1, byScope: { global: 1 }, byCategory: { business: 1 } } })
      if (url === "/api/memory/settings") return json({ settings: { enabled: true, scopeEnabled: { copywriting: true }, updatedAt: 1 } })
      throw new Error(`unexpected ${url}`)
    },
  })

  const synced = await client.refresh()
  assert.equal(synced.syncStatus, "synced")
  assert.equal(synced.syncedAt, 12345)
  assert.ok(storage.getItem(MEMORY_CACHE_KEY)?.includes("装修设计"))

  online = false
  const stale = await client.refresh()
  assert.equal(stale.syncStatus, "stale")
  assert.equal(stale.items[0]?.value, "装修设计")
})

test("refresh reports signed out instead of a sync failure when authentication is required", async () => {
  const storage = new MemoryStorage()
  storage.setItem(MEMORY_CACHE_KEY, JSON.stringify({ items: [{ id: "previous-account" }] }))
  const client = createUserMemoryClient({
    storage,
    fetchImpl: async () => json({ detail: { code: "NOT_LOGGED_IN", message: "please sign in" } }, 401),
  })

  const snapshot = await client.refresh()
  assert.equal(snapshot.syncStatus, "signed_out")
  assert.equal(snapshot.error, undefined)
  assert.deepEqual(snapshot.items, [])
  assert.equal(storage.getItem(MEMORY_CACHE_KEY), null)
})

test("memory client hides local and unknown 503 technical codes without desktop-only guidance", async () => {
  const localClient = createUserMemoryClient({
    fetchImpl: async () => json({
      detail: { code: "FASTAPI_UNAVAILABLE", message: "connect ECONNREFUSED" },
    }, 503),
  })
  await assert.rejects(localClient.listItems(), {
    message: "请求暂时未完成，请稍后重试。",
  })

  const unknownClient = createUserMemoryClient({
    fetchImpl: async () => json({ detail: { code: "MEMORY_HTTP_503", message: "HTTP 503" } }, 503),
  })
  await assert.rejects(unknownClient.listItems(), {
    message: "请求暂时未完成，请稍后重试。",
  })
})

test("legacy migration imports once and deletes source only after success", async () => {
  const storage = new MemoryStorage()
  storage.setItem(
    "copywriting-user-memory-v1",
    JSON.stringify({
      industry: "装修设计",
      role: "老板",
      goals: ["持续获客"],
      preferences: ["专业克制"],
      facts: ["服务中小企业"],
      lastUpdated: "2026-01-01",
    }),
  )
  let calls = 0
  const fetchImpl: typeof fetch = async (_input, init) => {
    calls += 1
    const body = JSON.parse(String(init?.body))
    assert.equal(body.memory.industry, "装修设计")
    return json({ imported: 5, alreadyImported: false })
  }

  const first = await migrateLegacyMemory({ storage, fetchImpl })
  const second = await migrateLegacyMemory({ storage, fetchImpl })
  assert.deepEqual(first, { migrated: true, imported: 5 })
  assert.deepEqual(second, { migrated: false, imported: 0 })
  assert.equal(storage.getItem("copywriting-user-memory-v1"), null)
  assert.equal(calls, 1)
})

test("failed legacy migration preserves source for retry", async () => {
  const storage = new MemoryStorage()
  storage.setItem("copywriting-user-memory-v1", JSON.stringify({ industry: "装修设计" }))

  const result = await migrateLegacyMemory({
    storage,
    fetchImpl: async () => new Response("failed", { status: 503 }),
  })

  assert.deepEqual(result, { migrated: false, imported: 0 })
  assert.notEqual(storage.getItem("copywriting-user-memory-v1"), null)
})

test("observe user turn sends one authored message with keepalive", async () => {
  let captured: RequestInit | undefined
  const client = createUserMemoryClient({
    fetchImpl: async (_input, init) => {
      captured = init
      return json({ status: "queued", updated: 0 })
    },
  })
  await client.observeUserTurn({
    scope: "copywriting",
    sessionId: "s1",
    messageId: "m1",
    userMessage: "我是装修老板",
  })

  assert.equal(captured?.keepalive, true)
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    scope: "copywriting",
    sessionId: "s1",
    messageId: "m1",
    userMessage: "我是装修老板",
  })
})
