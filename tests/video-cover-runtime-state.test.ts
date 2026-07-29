import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import test from "node:test"
import { fileURLToPath } from "node:url"
import * as coverRuntime from "../lib/video/cover-runtime.ts"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(
  path.join(projectRoot, "lib", "video", "cover-runtime.ts"),
  "utf8",
)

test("starting a cover retry clears the previous upload error", () => {
  assert.match(
    source,
    /coverStatus:\s*"running",\s*coverError:\s*""/,
  )
})

test("successful cover polling clears stale failure state", () => {
  assert.match(
    source,
    /coverStatus:\s*"success",\s*coverError:\s*""/,
  )
})

test("cover submit retries a transient client connection failure", async () => {
  const retrySubmit = (
    coverRuntime as typeof coverRuntime & {
      retryTransientCoverSubmit?: <T>(
        operation: () => Promise<T>,
        options?: { delayMs?: number },
      ) => Promise<T>
    }
  ).retryTransientCoverSubmit
  assert.equal(typeof retrySubmit, "function")

  let attempts = 0
  const result = await retrySubmit!(
    async () => {
      attempts += 1
      if (attempts === 1) {
        throw new Error("客户端服务暂时无法连接，请重启程序后再试。")
      }
      return { cover_task_id: "cover_retry_ok" }
    },
    { delayMs: 0 },
  )

  assert.deepEqual(result, { cover_task_id: "cover_retry_ok" })
  assert.equal(attempts, 2)
})
