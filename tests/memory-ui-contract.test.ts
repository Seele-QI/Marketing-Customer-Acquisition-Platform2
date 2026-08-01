import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const workspacePath = new URL("../components/copywriting-chat-workspace.tsx", import.meta.url)
const settingsPath = new URL("../components/settings-view.tsx", import.meta.url)
const indicatorPath = new URL("../components/memory/memory-indicator.tsx", import.meta.url)
const centerPath = new URL("../components/memory/memory-center-dialog.tsx", import.meta.url)
const rowPath = new URL("../components/memory/memory-item-row.tsx", import.meta.url)

test("copywriting uses synced account memory and never submits local memory context", async () => {
  const source = await readFile(workspacePath, "utf8")
  assert.match(source, /useUserMemory/)
  assert.match(source, /observeUserTurn/)
  assert.match(source, /onMemory/)
  assert.match(source, /MemoryCenterDialog/)
  assert.doesNotMatch(source, /buildMemoryContext/)
  assert.doesNotMatch(source, /updateUserMemory/)
  assert.doesNotMatch(source, /body:\s*JSON\.stringify\([^)]*memoryContext/s)
  assert.match(source, /data-copywriting-composer/)
  assert.match(source, /shrink-0/)
})

test("memory indicator exposes sync state and memories used for the current response", async () => {
  const source = await readFile(indicatorPath, "utf8")
  for (const state of ["syncing", "synced", "stale", "error", "disabled", "signed_out"]) {
    assert.match(source, new RegExp(state))
  }
  assert.match(source, /本次使用/)
  assert.match(source, /长期档案/)
})

test("memory center supports filter, edit, pin, disable, restore, delete, and clear", async () => {
  const source = `${await readFile(centerPath, "utf8")}\n${await readFile(rowPath, "utf8")}`
  for (const capability of [
    "scopeFilter",
    "statusFilter",
    "updateItem",
    "pinned",
    "disabled",
    "active",
    "deleteItem",
    "clearAll",
  ]) {
    assert.match(source, new RegExp(capability))
  }
  assert.match(source, /overflow-y-auto/)
  assert.match(source, /min-h-0/)
  assert.match(source, /const mutable = item\.status === "active" \|\| item\.status === "disabled"/)
})

test("settings exposes the same account memory center and scope toggles", async () => {
  const source = await readFile(settingsPath, "utf8")
  assert.match(source, /MemorySettingsCard/)
  assert.match(source, /MemoryCenterDialog/)
})
