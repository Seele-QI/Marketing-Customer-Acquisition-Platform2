import assert from "node:assert/strict"
import test, { afterEach, beforeEach } from "node:test"

import type { GeneratedArticle } from "../lib/geo/article-types.ts"

const values = new Map<string, string>()

beforeEach(() => {
  values.clear()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {},
  })
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  })
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, "window")
  Reflect.deleteProperty(globalThis, "localStorage")
})

function article(id: string, projectId: string): GeneratedArticle {
  return {
    id,
    jobId: `job-${id}`,
    projectId,
    mode: "matrix",
    platformId: "zhihu",
    title: id,
    markdown: `# ${id}`,
    status: "success",
    createdAt: Date.now(),
  }
}

test("article batches are loaded and returned only for the selected matrix project", async () => {
  const store = await import("../lib/geo/article-batch-store.ts?" + Date.now())

  assert.deepEqual(store.mergeArticles([article("a", "project-a")], "project-a").map((a) => a.id), ["a"])
  assert.deepEqual(store.mergeArticles([article("b", "project-b")], "project-b").map((a) => a.id), ["b"])
  assert.deepEqual(store.loadArticleBatch("project-a").articles.map((a) => a.id), ["a"])
  assert.deepEqual(store.loadArticleBatch("project-b").articles.map((a) => a.id), ["b"])
})

test("legacy mixed cache is partitioned by project without deleting either project", async () => {
  const store = await import("../lib/geo/article-batch-store.ts?" + Date.now())
  values.set(
    store.ARTICLE_BATCH_STORAGE_KEY,
    JSON.stringify({
      articles: [article("a", "project-a"), article("b", "project-b")],
      updatedAt: 1,
    }),
  )

  assert.equal(store.loadArticleBatch("project-a").articles.length, 1)
  assert.equal(store.loadArticleBatch("project-b").articles.length, 1)
})

test("illustration config and task snapshots remain scoped to their matrix project", async () => {
  const store = await import("../lib/geo/article-batch-store.ts?" + Date.now())
  const projectA = {
    ...article("a", "project-a"),
    illustrationsPerArticle: 3,
    illustrationTask: {
      taskId: "task-a",
      projectId: "project-a",
      articleId: "a",
      requestedCount: 3,
      completedCount: 0,
      failedCount: 0,
      status: "running" as const,
      items: [],
      updatedAt: 1,
    },
  }
  const projectB = article("b", "project-b")

  store.mergeArticles([projectA], "project-a")
  store.mergeArticles([projectB], "project-b")
  store.saveBatchConfig({
    mode: "matrix",
    projectId: "project-a",
    dates: ["2026-07-30"],
    illustrationsPerArticle: 3,
  })
  store.saveBatchConfig({
    mode: "matrix",
    projectId: "project-b",
    dates: ["2026-07-31"],
    illustrationsPerArticle: 1,
  })

  assert.equal(
    store.loadArticleBatch("project-a").articles[0]?.illustrationTask?.taskId,
    "task-a",
  )
  assert.equal(
    store.loadArticleBatch("project-a").lastConfig?.illustrationsPerArticle,
    3,
  )
  assert.equal(
    store.loadArticleBatch("project-b").articles[0]?.illustrationTask,
    undefined,
  )
  assert.equal(
    store.loadArticleBatch("project-b").lastConfig?.illustrationsPerArticle,
    1,
  )
})
