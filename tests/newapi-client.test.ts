import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getSonettoApiKey,
  getSonettoBaseUrl,
  isSonettoProviderConfigured,
} from "@/lib/llm/sonetto-client"

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void,
): void {
  const restores: Array<() => void> = []
  for (const [name, value] of Object.entries(values)) {
    const prev = process.env[name]
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
    restores.push(() => {
      if (prev === undefined) delete process.env[name]
      else process.env[name] = prev
    })
  }
  try {
    fn()
  } finally {
    for (const restore of restores.reverse()) restore()
  }
}

describe("newapi client", () => {
  it("normalizes aicost base URL to /v1", () => {
    withEnv(
      {
        NEWAPI_BASE_URL: "https://www.aicost.xyz",
        SONETTO_BASE_URL: undefined,
      },
      () => {
        assert.equal(getSonettoBaseUrl(), "https://www.aicost.xyz/v1")
      },
    )
  })

  it("prefers NEWAPI_BASE_URL over SONETTO_BASE_URL", () => {
    withEnv(
      {
        NEWAPI_BASE_URL: "https://www.aicost.xyz",
        SONETTO_BASE_URL: "https://tok.sonetto.top/v1",
      },
      () => {
        assert.equal(getSonettoBaseUrl(), "https://www.aicost.xyz/v1")
      },
    )
  })

  it("uses unified NEWAPI_KEY for both providers", () => {
    withEnv(
      {
        NEWAPI_KEY: "sk-unified",
        SONETTO_GPT_API_KEY: undefined,
        SONETTO_CLAUDE_API_KEY: undefined,
      },
      () => {
        assert.equal(getSonettoApiKey("sonetto_gpt"), "sk-unified")
        assert.equal(getSonettoApiKey("sonetto_claude"), "sk-unified")
        assert.equal(isSonettoProviderConfigured("sonetto_gpt"), true)
        assert.equal(isSonettoProviderConfigured("sonetto_claude"), true)
      },
    )
  })

  it("falls back to legacy per-provider keys", () => {
    withEnv(
      {
        NEWAPI_KEY: undefined,
        SONETTO_GPT_API_KEY: "sk-gpt",
        SONETTO_CLAUDE_API_KEY: "sk-claude",
      },
      () => {
        assert.equal(getSonettoApiKey("sonetto_gpt"), "sk-gpt")
        assert.equal(getSonettoApiKey("sonetto_claude"), "sk-claude")
      },
    )
  })
})
