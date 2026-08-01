import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const route = readFileSync("app/api/business-assistant/chat/route.ts", "utf8")

test("assistant chat is authenticated, project-bound, memory-aware and billed", () => {
  assert.match(route, /withAuth/)
  assert.match(route, /loadBusinessProjectServer/)
  assert.match(route, /project\.assistantId !== assistant\.id/)
  assert.match(route, /retrieveServerMemory/)
  assert.match(route, /scope:\s*project\.kind/)
  assert.match(route, /chargeBillingEvent/)
})

test("reserved assistants and direct execution actions are rejected", () => {
  assert.match(route, /assistant\.availability !== "enabled"/)
  assert.match(route, /禁止返回 generate、publish、charge、delete/)
  assert.match(route, /parseAssistantCompletion/)
})

test("assistant chat reports when durable message persistence is unavailable", () => {
  assert.match(route, /storedUserMessage/)
  assert.match(route, /storedAssistantMessage/)
  assert.match(route, /persistenceWarning/)
})
