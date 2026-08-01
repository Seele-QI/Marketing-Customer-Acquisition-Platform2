import assert from "node:assert/strict"
import test from "node:test"

import {
  queryImageWorkbenchStatus,
  submitImageWorkbenchTask,
  waitForImageWorkbenchResult,
} from "@/lib/image-workbench/api"

test("image workbench submit sends the shared snake-case contract", async () => {
  let captured: RequestInit | undefined
  const fetcher: typeof fetch = async (_input, init) => {
    captured = init
    return Response.json({ task_id: "image_1" })
  }

  const result = await submitImageWorkbenchTask(
    {
      mode: "image",
      prompt: "城市夜景",
      aspectRatio: "16:9",
      resolution: "2k",
      referenceMode: "style_only",
      referenceImages: [
        {
          id: "ref-1",
          name: "style.png",
          role: "general",
          mimeType: "image/png",
          dataBase64: "YQ==",
          previewUrl: "data:image/png;base64,YQ==",
        },
      ],
    },
    fetcher,
  )

  assert.equal(result.task_id, "image_1")
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    mode: "image",
    prompt: "城市夜景",
    aspect_ratio: "16:9",
    resolution: "2k",
    count: 2,
    reference_mode: "style_only",
    reference_images: [
      {
        role: "general",
        mime_type: "image/png",
        data_base64: "YQ==",
      },
    ],
  })
})

test("image workbench status surfaces API detail", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({ detail: "图片任务不存在" }, { status: 404 })
  await assert.rejects(
    () => queryImageWorkbenchStatus("missing", fetcher),
    /图片任务不存在/,
  )
})

test("image workbench polling returns terminal success", async () => {
  const statuses = [
    { task_id: "image_1", mode: "image", status: "running", image_urls: [] },
    {
      task_id: "image_1",
      mode: "image",
      status: "success",
      image_urls: ["/static/image-workbench/image_1-1.png"],
    },
  ]
  const fetcher: typeof fetch = async () => Response.json(statuses.shift())

  const result = await waitForImageWorkbenchResult("image_1", {
    fetcher,
    intervalMs: 0,
    timeoutMs: 1_000,
    sleep: async () => undefined,
  })
  assert.equal(result.status, "success")
})

test("image workbench polling times out without mutating backend state", async () => {
  let now = 0
  const fetcher: typeof fetch = async () =>
    Response.json({
      task_id: "image_1",
      mode: "poster",
      status: "running",
      image_urls: [],
    })
  await assert.rejects(
    () =>
      waitForImageWorkbenchResult("image_1", {
        fetcher,
        intervalMs: 0,
        timeoutMs: 10,
        now: () => {
          now += 11
          return now
        },
        sleep: async () => undefined,
      }),
    /生成等待超时/,
  )
})

test("image workbench polling retries transient status failures", async () => {
  let calls = 0
  const retries: number[] = []
  const fetcher: typeof fetch = async () => {
    calls += 1
    if (calls === 1) throw new TypeError("fetch failed")
    if (calls === 2) return Response.json({ detail: "busy" }, { status: 503 })
    return Response.json({
      task_id: "image_1",
      mode: "image",
      status: "success",
      image_urls: ["/done.png"],
    })
  }
  const result = await waitForImageWorkbenchResult("image_1", {
    fetcher,
    intervalMs: 10,
    timeoutMs: 1_000,
    sleep: async () => undefined,
    onRetry: (_error, attempt) => retries.push(attempt),
  })
  assert.equal(result.status, "success")
  assert.deepEqual(retries, [1, 2])
})

test("image workbench polling does not retry a missing task", async () => {
  let calls = 0
  const fetcher: typeof fetch = async () => {
    calls += 1
    return Response.json({ detail: "图片任务不存在" }, { status: 404 })
  }
  await assert.rejects(
    () => waitForImageWorkbenchResult("missing", {
      fetcher,
      intervalMs: 0,
      sleep: async () => undefined,
    }),
    /图片任务不存在/,
  )
  assert.equal(calls, 1)
})
