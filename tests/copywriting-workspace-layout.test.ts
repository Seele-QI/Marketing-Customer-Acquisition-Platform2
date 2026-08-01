import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const workspaceSource = readFileSync(
  new URL("../components/copywriting-chat-workspace.tsx", import.meta.url),
  "utf8",
)
const pageSource = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8")

test("copywriting workspace owns viewport scrolling and keeps composer fixed", () => {
  assert.match(workspaceSource, /data-copywriting-fixed-sidebar/)
  assert.match(workspaceSource, /data-copywriting-history-scroll/)
  assert.match(workspaceSource, /data-copywriting-message-scroll/)
  assert.match(workspaceSource, /data-copywriting-composer/)
  assert.match(workspaceSource, /h-full[^"\n]*overflow-hidden/)
  assert.match(pageSource, /activeView === "文案创作"[\s\S]*?h-dvh min-h-0 overflow-hidden/)
})

test("copywriting client does not select or submit a local model", () => {
  assert.ok(!workspaceSource.includes("AiModelPicker"))
  assert.ok(!workspaceSource.includes("useAiModels"))
  assert.ok(!workspaceSource.includes("isSonettoModelId"))
  assert.ok(!workspaceSource.includes("modelId:"))
})
