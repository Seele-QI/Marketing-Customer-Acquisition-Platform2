import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import { describe, it } from "node:test"

const CLIENT_ERROR_FILES = [
  "../components/account-positioning.tsx",
  "../components/chat-workspace.tsx",
  "../components/hot-topics.tsx",
  "../components/positioning-chat-dialog.tsx",
  "../components/video-detail-modal.tsx",
  "../lib/ark-images-client.ts",
  "../lib/geo/article-batch-api.ts",
  "../lib/geo/matrix-api.ts",
  "../lib/memory/client.ts",
]

describe("customer-visible error surfaces", () => {
  it("do not construct raw HTTP or local developer instructions", async () => {
    for (const relative of CLIENT_ERROR_FILES) {
      const source = await readFile(new URL(relative, import.meta.url), "utf8")
      assert.doesNotMatch(source, /`[^`]*HTTP \$\{(?:response|res|resp)\.status\}/, relative)
      assert.doesNotMatch(source, /pnpm dev:all|MEMORY_HTTP_|FASTAPI_UNAVAILABLE/, relative)
    }
  })
})
