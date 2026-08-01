import assert from "node:assert/strict"
import test from "node:test"

import {
  queryArticleIllustrationStatus,
  retryFailedArticleIllustrations,
  submitArticleIllustrationTask,
  waitForArticleIllustrationResult,
} from "@/lib/geo/article-illustration-api"

const scope = {
  taskId: "task-1",
  projectId: "p1",
  articleId: "a1",
}

test("submit sends only the public article contract", async () => {
  let body = ""
  const fetcher: typeof fetch = async (_input, init) => {
    body = String(init?.body)
    return Response.json({
      task_id: "task-1",
      project_id: "p1",
      article_id: "a1",
      status: "queued",
      items: [],
    })
  }
  await submitArticleIllustrationTask(
    {
      projectId: "p1",
      articleId: "a1",
      platformId: "zhihu",
      title: "标题",
      markdown: "## 正文\n内容",
      illustrationCount: 2,
    },
    fetcher,
  )
  assert.deepEqual(JSON.parse(body), {
    projectId: "p1",
    articleId: "a1",
    platformId: "zhihu",
    title: "标题",
    markdown: "## 正文\n内容",
    illustrationCount: 2,
  })
})

test("status includes full scope and retries transient failures", async () => {
  let calls = 0
  const urls: string[] = []
  const fetcher: typeof fetch = async (input) => {
    calls += 1
    urls.push(String(input))
    if (calls === 1) return Response.json({ detail: "busy" }, { status: 503 })
    return Response.json({
      task_id: "task-1",
      project_id: "p1",
      article_id: "a1",
      status: "success",
      items: [],
    })
  }
  const result = await waitForArticleIllustrationResult(scope, {
    fetcher,
    intervalMs: 0,
    sleep: async () => undefined,
  })
  assert.equal(result.status, "success")
  assert.equal(calls, 2)
  assert.match(urls[1]!, /taskId=task-1/)
  assert.match(urls[1]!, /projectId=p1/)
  assert.match(urls[1]!, /articleId=a1/)
})

test("missing status is terminal and is not retried", async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    return Response.json({ detail: "图片任务不存在" }, { status: 404 })
  }
  await assert.rejects(
    () =>
      waitForArticleIllustrationResult(scope, {
        fetcher,
        intervalMs: 0,
        sleep: async () => undefined,
      }),
    /图片任务不存在/,
  )
  assert.equal(calls, 1)
})

test("retry sends only failed illustration ids", async () => {
  let body = ""
  const fetcher: typeof fetch = async (_input, init) => {
    body = String(init?.body)
    return Response.json({
      task_id: "task-1",
      project_id: "p1",
      article_id: "a1",
      status: "running",
      items: [],
    })
  }
  await retryFailedArticleIllustrations(scope, ["ill-2"], fetcher)
  assert.deepEqual(JSON.parse(body), {
    projectId: "p1",
    articleId: "a1",
    taskId: "task-1",
    failedIllustrationIds: ["ill-2"],
  })
})

test("status query rejects scope-free calls at the type boundary", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({
      task_id: "task-1",
      project_id: "p1",
      article_id: "a1",
      status: "running",
      items: [],
    })
  const result = await queryArticleIllustrationStatus(scope, fetcher)
  assert.equal(result.projectId, "p1")
})
