import assert from "node:assert/strict"
import test from "node:test"

import {
  queryPosterStatus,
  submitPosterGeneration,
  waitForPosterResult,
} from "@/lib/poster/api"

test("poster submit sends the FastAPI snake-case contract", async () => {
  let captured: RequestInit | undefined
  const fetcher: typeof fetch = async (_input, init) => {
    captured = init
    return Response.json({ poster_task_id: "poster_1" })
  }

  const result = await submitPosterGeneration(
    {
      prompt: "商业海报",
      aspectRatio: "25:9",
      resolution: "2k",
      count: 2,
    },
    fetcher,
  )

  assert.equal(result.poster_task_id, "poster_1")
  assert.deepEqual(JSON.parse(String(captured?.body)), {
    prompt: "商业海报",
    aspect_ratio: "25:9",
    resolution: "2k",
    count: 2,
  })
})

test("poster status surfaces API detail", async () => {
  const fetcher: typeof fetch = async () =>
    Response.json({ detail: "海报任务不存在" }, { status: 404 })

  await assert.rejects(
    () => queryPosterStatus("missing", fetcher),
    /海报任务不存在/,
  )
})

test("poster polling returns terminal success", async () => {
  const statuses = [
    { poster_task_id: "poster_1", status: "running", image_urls: [] },
    {
      poster_task_id: "poster_1",
      status: "success",
      image_urls: ["/static/posters/poster_1-1.png"],
    },
  ]
  const fetcher: typeof fetch = async () => Response.json(statuses.shift())

  const result = await waitForPosterResult("poster_1", {
    fetcher,
    intervalMs: 0,
    timeoutMs: 1_000,
    sleep: async () => undefined,
  })

  assert.equal(result.status, "success")
  assert.equal(result.image_urls.length, 1)
})

test("poster polling stops at its timeout", async () => {
  let now = 0
  const fetcher: typeof fetch = async () =>
    Response.json({ poster_task_id: "poster_1", status: "running", image_urls: [] })

  await assert.rejects(
    () =>
      waitForPosterResult("poster_1", {
        fetcher,
        intervalMs: 0,
        timeoutMs: 10,
        now: () => {
          now += 11
          return now
        },
        sleep: async () => undefined,
      }),
    /海报生成超时/,
  )
})
