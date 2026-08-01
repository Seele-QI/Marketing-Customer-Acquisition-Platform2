import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const page = readFileSync("app/page.tsx", "utf8")
const dashboard = readFileSync("components/dashboard-view.tsx", "utf8")
const shell = readFileSync("components/business-assistant-shell.tsx", "utf8")

test("persistent shell is mounted outside changing content", () => {
  assert.match(page, /<BusinessAssistantProvider/)
  assert.match(page, /<ContentArea/)
  assert.match(page, /<BusinessAssistantShell\s*\/>/)
  assert.equal(page.includes("<BusinessAssistantShell key="), false)
})

test("workbench keeps banner and exposes five major directions", () => {
  assert.match(dashboard, /<TopBanner\s*\/>/)
  for (const label of [
    "视频创作",
    "GEO 创作",
    "图片工作台",
    "抖音截流",
    "身份定位",
  ]) {
    assert.match(dashboard, new RegExp(label))
  }
  assert.doesNotMatch(dashboard, /DashboardQuickActions|DashboardAIInsights|AgentCard/)
  assert.match(dashboard, /reserved:\s*true/)
  assert.doesNotMatch(dashboard, /assistant\.createProject/)
  assert.match(dashboard, /打开操作指南/)
})

test("assistant drawer prioritizes current-page guidance without requiring a project", () => {
  assert.match(shell, /\["guide", ListChecks, "操作指南"\]/)
  assert.match(shell, /\["ask", MessageCircle, "问助理"\]/)
  assert.match(shell, /\["progress", FolderKanban, "我的进度"\]/)
  assert.match(shell, /不需要先创建项目/)
  assert.match(shell, /生成、扣费和发布仍由你确认/)
})
