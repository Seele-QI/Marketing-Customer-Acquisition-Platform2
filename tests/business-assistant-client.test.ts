import assert from "node:assert/strict"
import test from "node:test"

import { createBusinessAssistantClient } from "../lib/business-assistant/client.ts"

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status })
}

test("project client uses credentialed account routes and stable request bodies", async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const client = createBusinessAssistantClient({
    fetchImpl: async (input, init) => {
      const url = String(input)
      calls.push({ url, init })
      if (url === "/api/business-assistant/projects?kind=video&status=active") {
        return json({ projects: [] })
      }
      if (url === "/api/business-assistant/projects" && init?.method === "POST") {
        return json({
          project: {
            id: "p1",
            kind: "video",
            title: "首批口播",
            goal: "生成三条成片",
            status: "active",
            currentStage: "",
            assistantId: "video-creation",
            revision: 1,
            createdAt: 1,
            updatedAt: 1,
            steps: [],
          },
        })
      }
      if (
        url === "/api/business-assistant/projects/p1" &&
        init?.method === "PATCH"
      ) {
        return json({ project: { id: "p1", revision: 2, steps: [] } })
      }
      throw new Error(`unexpected ${url}`)
    },
  })

  await client.listProjects({ kind: "video", status: "active" })
  await client.createProject({
    kind: "video",
    title: "首批口播",
    goal: "生成三条成片",
    assistantId: "video-creation",
  })
  await client.updateProject("p1", 1, { title: "更新后的项目" })

  assert.equal(calls.length, 3)
  assert.equal(calls[0]?.init?.credentials, "include")
  assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)), {
    kind: "video",
    title: "首批口播",
    goal: "生成三条成片",
    assistantId: "video-creation",
  })
  assert.deepEqual(JSON.parse(String(calls[2]?.init?.body)), {
    revision: 1,
    title: "更新后的项目",
  })
})

test("project client surfaces revision conflict without hiding the message", async () => {
  const client = createBusinessAssistantClient({
    fetchImpl: async () =>
      json(
        {
          detail: {
            code: "BUSINESS_PROJECT_REVISION_CONFLICT",
            message: "项目已在其他位置更新，请刷新后重试",
          },
        },
        409,
      ),
  })

  await assert.rejects(
    client.updateProject("p1", 1, { title: "过期更新" }),
    (error: unknown) => {
      assert.equal(
        (error as { code?: string }).code,
        "BUSINESS_PROJECT_REVISION_CONFLICT",
      )
      assert.match(
        (error as Error).message,
        /项目已在其他位置更新/,
      )
      return true
    },
  )
})

test("project client retries transient GET failures but never replays a chat POST", async () => {
  let listCalls = 0
  const listClient = createBusinessAssistantClient({
    fetchImpl: async () => {
      listCalls += 1
      return listCalls < 3
        ? json({ detail: "busy" }, 503)
        : json({ projects: [] })
    },
  })
  await listClient.listProjects()
  assert.equal(listCalls, 3)

  let chatCalls = 0
  const chatClient = createBusinessAssistantClient({
    fetchImpl: async () => {
      chatCalls += 1
      return json({ detail: "busy" }, 503)
    },
  })
  await assert.rejects(
    chatClient.sendMessage({
      projectId: "p1",
      assistantId: "video-creation",
      message: "继续",
    }),
    /busy/,
  )
  assert.equal(chatCalls, 1)
})
