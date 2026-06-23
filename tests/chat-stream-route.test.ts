import assert from "node:assert/strict"
import test from "node:test"

import { POST } from "../app/api/ai/chat-stream/route.ts"
import {
  buildCopywritingEnrichedSystemPrompt,
  COPYWRITING_PURE_ORAL_RULES,
} from "../lib/prompts/copywriting-agent-systems.ts"
import { getWorkflowKnowledgeForAgent } from "../lib/prompts/copywriting-workflow-knowledge.ts"

function createJsonRequest(body: unknown): Request {
  return new Request("http://localhost/api/ai/chat-stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function createSseResponse(): Response {
  return new Response("data: ok\n\n", {
    status: 200,
    headers: { "Content-Type": "text/event-stream; charset=utf-8" },
  })
}

function setEnv(name: string, value: string | undefined): () => void {
  const previous = process.env[name]
  if (value === undefined) {
    delete process.env[name]
  } else {
    process.env[name] = value
  }

  return () => {
    if (previous === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = previous
    }
  }
}

function withEnvSnapshot(
  values: Record<string, string | undefined>,
  callback: () => Promise<void>,
): Promise<void> {
  const restores = Object.entries(values).map(([name, value]) => setEnv(name, value))
  return callback().finally(() => {
    for (const restore of restores.reverse()) restore()
  })
}

async function captureUpstreamRequest(run: () => Promise<Response>): Promise<{
  response: Response
  calls: Array<{ url: string; init: RequestInit | undefined }>
}> {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = []
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init })
    return createSseResponse()
  }) as typeof fetch

  try {
    const response = await run()
    return { response, calls }
  } finally {
    globalThis.fetch = originalFetch
  }
}

function parseUpstreamBody(call: { init: RequestInit | undefined }): {
  model: string
  messages: Array<{ role: string; content: string | Array<{ type: string }> }>
} {
  return JSON.parse(String(call.init?.body)) as {
    model: string
    messages: Array<{ role: string; content: string | Array<{ type: string }> }>
  }
}

test("文本请求会把固定角色的 enrichedSystemContent 作为 system message 发给上游", async (t) => {
  const agentName = "实体店获客脚本创作"
  const memoryContext = "用户偏好：说人话，别啰嗦"
  const workflowKnowledge = getWorkflowKnowledgeForAgent(agentName)
  const expectedSystem = buildCopywritingEnrichedSystemPrompt({
    agentName,
    workflowKnowledge,
    memoryContext,
  })

  const { response, calls } = await withEnvSnapshot(
    {
      DEEPSEEK_API_KEY: "sk-text",
      DEEPSEEK_VISION_MODEL: undefined,
      ARK_API_KEY: undefined,
      ARK_API_SECRET: undefined,
      ARK_MODEL: undefined,
      ARK_ENDPOINT_ID: undefined,
    },
    () =>
      captureUpstreamRequest(() =>
        POST(
          createJsonRequest({
            userMessage: "写一段装修避坑口播稿",
            agentName,
            memoryContext,
          }),
        ),
      ),
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  const upstreamBody = parseUpstreamBody(calls[0])

  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions")
  assert.equal(upstreamBody.model, "deepseek-chat")
  assert.equal(upstreamBody.messages[0]?.role, "system")
  assert.equal(upstreamBody.messages[0]?.content, expectedSystem)
  assert.match(String(upstreamBody.messages[0]?.content), /只输出可直接朗读的纯口播稿正文/)
  assert.ok(String(upstreamBody.messages[0]?.content).includes(COPYWRITING_PURE_ORAL_RULES.trim()))
})

test("带图请求走 DeepSeek 多模态时会把兜底角色的 enrichedSystemContent 作为 system message 发给上游", async () => {
  const agentName = "自定义角色"
  const memoryContext = "用户记忆：不要括号提示"
  const workflowKnowledge = getWorkflowKnowledgeForAgent(agentName)
  const expectedSystem = buildCopywritingEnrichedSystemPrompt({
    agentName,
    workflowKnowledge,
    memoryContext,
  })

  const { response, calls } = await withEnvSnapshot(
    {
      DEEPSEEK_API_KEY: "sk-image",
      DEEPSEEK_VISION_MODEL: undefined,
      ARK_API_KEY: undefined,
      ARK_API_SECRET: undefined,
      ARK_MODEL: undefined,
      ARK_ENDPOINT_ID: undefined,
    },
    () =>
      captureUpstreamRequest(() =>
        POST(
          createJsonRequest({
            userMessage: "根据图片写口播稿",
            agentName,
            memoryContext,
            images: [{ mimeType: "image/png", dataBase64: "aGVsbG8=" }],
          }),
        ),
      ),
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  const upstreamBody = parseUpstreamBody(calls[0])
  const lastMessage = upstreamBody.messages[upstreamBody.messages.length - 1]

  assert.equal(calls[0].url, "https://api.deepseek.com/chat/completions")
  assert.equal(upstreamBody.model, "deepseek-v4-flash")
  assert.equal(upstreamBody.messages[0]?.role, "system")
  assert.equal(upstreamBody.messages[0]?.content, expectedSystem)
  assert.match(String(upstreamBody.messages[0]?.content), /你是「自定义角色」/)
  assert.ok(String(upstreamBody.messages[0]?.content).includes(COPYWRITING_PURE_ORAL_RULES.trim()))
  assert.equal(lastMessage?.role, "user")
  assert.ok(Array.isArray(lastMessage?.content))
})

test("带图请求走 ARK Vision 时会把固定角色的 enrichedSystemContent 作为 system message 发给上游", async () => {
  const agentName = "高效口播脚本"
  const memoryContext = "用户记忆：节奏更利落"
  const workflowKnowledge = getWorkflowKnowledgeForAgent(agentName)
  const expectedSystem = buildCopywritingEnrichedSystemPrompt({
    agentName,
    workflowKnowledge,
    memoryContext,
  })

  const { response, calls } = await withEnvSnapshot(
    {
      DEEPSEEK_API_KEY: undefined,
      ARK_API_KEY: "ark-bearer",
      ARK_API_SECRET: undefined,
      ARK_ENDPOINT_ID: "ep-vision-001",
      ARK_MODEL: undefined,
      ARK_BASE_URL: "https://ark.cn-beijing.volces.com/api/v3",
    },
    () =>
      captureUpstreamRequest(() =>
        POST(
          createJsonRequest({
            userMessage: "结合图片写护肤品口播稿",
            agentName,
            memoryContext,
            images: [{ mimeType: "image/jpeg", dataBase64: "aGVsbG8=" }],
          }),
        ),
      ),
  )

  assert.equal(response.status, 200)
  assert.equal(calls.length, 1)
  const upstreamBody = parseUpstreamBody(calls[0])
  const lastMessage = upstreamBody.messages[upstreamBody.messages.length - 1]

  assert.equal(calls[0].url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
  assert.equal(upstreamBody.model, "ep-vision-001")
  assert.equal(upstreamBody.messages[0]?.role, "system")
  assert.equal(upstreamBody.messages[0]?.content, expectedSystem)
  assert.ok(String(upstreamBody.messages[0]?.content).includes(COPYWRITING_PURE_ORAL_RULES.trim()))
  assert.match(String(upstreamBody.messages[0]?.content), /你是「高效口播脚本」专家/)
  assert.equal(lastMessage?.role, "user")
  assert.ok(Array.isArray(lastMessage?.content))
})
