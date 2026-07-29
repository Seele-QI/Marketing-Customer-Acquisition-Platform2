import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import { resolveAssistantForView } from "@/lib/business-assistant/registry"

test("all main image entry points use the image workbench name", () => {
  const sidebar = readFileSync("components/dashboard-sidebar.tsx", "utf8")
  const dashboard = readFileSync("components/dashboard-view.tsx", "utf8")
  const page = readFileSync("app/page.tsx", "utf8")
  const search = readFileSync("lib/global-search.ts", "utf8")

  assert.match(sidebar, /图片工作台/)
  assert.doesNotMatch(sidebar, /label:\s*"海报图创作"/)
  assert.match(dashboard, /title:\s*"图片工作台"/)
  assert.match(dashboard, /view:\s*"图片工作台"/)
  assert.match(page, /activeView === "图片工作台"/)
  assert.match(search, /title:\s*"图片工作台"/)
  assert.match(search, /view:\s*"图片工作台"/)
})

test("image workbench remains outside the business assistant registry", () => {
  assert.equal(resolveAssistantForView("图片工作台"), undefined)
})
