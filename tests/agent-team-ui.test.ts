import assert from "node:assert/strict"
import fs from "node:fs"
import test from "node:test"

function source(path: string) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), "utf8")
}

test("team center exposes coordinator, group filters, skills and honest availability", () => {
  const text = source("components/agents/team-agent-center.tsx")
  assert.match(text, /总协调官/)
  assert.match(text, /治理职能/)
  assert.match(text, /产品与技术/)
  assert.match(text, /市场与增长/)
  assert.match(text, /交付与服务/)
  assert.match(text, /行业专家/)
  assert.match(text, /服务可用/)
})

test("team workspace hides model selection and supports files, collaboration, partial and approval states", () => {
  const text = source("components/agents/team-chat-workspace.tsx")
  assert.match(text, /云端智能路由/)
  assert.doesNotMatch(text, /AiModelPicker/)
  assert.match(text, /AttachmentStrip/)
  assert.match(text, /CollaborationPanel/)
  assert.match(text, /partial/)
  assert.match(text, /审批/)
  assert.match(text, /最近任务/)
  assert.match(text, /listEnterpriseAgentRuns/)
  assert.match(text, /AgentTaskTrace/)
  assert.match(text, /planEnterpriseAgentTask/)
  assert.match(text, /DeepSeek 快速通道/)
  assert.doesNotMatch(text, /h-dvh/)
  assert.doesNotMatch(text, /公司专业部门/)
  const attachments = source("components/agents/attachment-strip.tsx")
  assert.match(attachments, /AGENT_ATTACHMENT_ACCEPT/)
  assert.match(attachments, /公司知识库/)
  assert.match(attachments, /部门知识库/)
})

test("team workspace stays inside the middle-platform shell while copywriting keeps its overlay", () => {
  const text = source("app/page.tsx")
  assert.match(text, /agentChatOpen && isCopywritingMode/)
  assert.match(text, /agentChatOpen && !isCopywritingMode/)
  assert.match(text, /DashboardSidebar/)
  assert.match(text, /TeamChatWorkspace/)
  assert.doesNotMatch(text, /agentChatOpen && "hidden"/)
})
