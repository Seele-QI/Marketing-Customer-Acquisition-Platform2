import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

import {
  buildInitialIllustrationSnapshot,
  failedArticleIllustrationIds,
  shouldResumeArticleIllustrations,
} from "@/lib/geo/article-illustration-orchestration"

test("builds a persisted queued snapshot before provider submission", () => {
  assert.deepEqual(
    buildInitialIllustrationSnapshot({
      projectId: "project-a",
      articleId: "article-a",
      count: 3,
      now: 123,
    }),
    {
      taskId: "",
      projectId: "project-a",
      articleId: "article-a",
      requestedCount: 3,
      completedCount: 0,
      failedCount: 0,
      status: "queued",
      items: [],
      updatedAt: 123,
    },
  )
})

test("retry selects only failed illustration IDs", () => {
  assert.deepEqual(
    failedArticleIllustrationIds({
      taskId: "task-a",
      projectId: "project-a",
      articleId: "article-a",
      requestedCount: 3,
      completedCount: 1,
      failedCount: 1,
      status: "success",
      updatedAt: 1,
      items: [
        {
          illustrationId: "ok",
          anchorHeading: "A",
          anchorOccurrence: 1,
          alt: "A",
          status: "success",
          imageUrl:
            "/static/geo-article-illustrations/project-a/article-a/ok.png",
        },
        {
          illustrationId: "failed",
          anchorHeading: "B",
          anchorOccurrence: 1,
          alt: "B",
          status: "failed",
        },
        {
          illustrationId: "running",
          anchorHeading: "C",
          anchorOccurrence: 1,
          alt: "C",
          status: "running",
        },
      ],
    }),
    ["failed"],
  )
})

test("resume requires a real non-terminal task ID", () => {
  const base = buildInitialIllustrationSnapshot({
    projectId: "project-a",
    articleId: "article-a",
    count: 2,
    now: 1,
  })
  assert.equal(shouldResumeArticleIllustrations(base), false)
  assert.equal(
    shouldResumeArticleIllustrations({ ...base, taskId: "task-a" }),
    true,
  )
  assert.equal(
    shouldResumeArticleIllustrations({
      ...base,
      taskId: "task-a",
      status: "success",
    }),
    false,
  )
})

test("editor persists task state, scopes late writes, resumes, and retries failed IDs", () => {
  const editor = readFileSync(
    new URL(
      "../components/geo-article-editor-view.tsx",
      import.meta.url,
    ),
    "utf8",
  )
  assert.match(editor, /persistIllustrationSnapshot\(prepared, initial\)/)
  assert.match(
    editor,
    /persistIllustrationSnapshot\(prepared, snapshot\)[\s\S]*pollIllustrationTask\(prepared, snapshot\)/,
  )
  assert.match(
    editor,
    /projectId !== selectedProjectIdRef\.current[\s\S]*return updated/,
  )
  assert.match(editor, /shouldResumeArticleIllustrations\(snapshot\)/)
  assert.match(editor, /failedArticleIllustrationIds\(snapshot\)/)
  assert.match(editor, /controller\.abort\(\)/)
})
