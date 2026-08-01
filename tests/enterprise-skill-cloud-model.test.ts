import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

import {
  completeCloudCopywritingText,
  type CloudCopywritingCompletion,
} from "../lib/geo/cloud-copywriting-completion.ts"
import type { CopywritingProviderCandidate } from "../lib/llm/copywriting-router.ts"

const projectRoot = new URL("../", import.meta.url)

function provider(name: string): CopywritingProviderCandidate {
  return {
    source: "cloud",
    name,
    adapter: "openai_chat",
    url: `https://${name}.example/v1/chat/completions`,
    apiKey: `${name}-secret`,
    model: `${name}-model`,
    timeoutMs: 1_000,
  }
}

const messages = [
  { role: "system" as const, content: "system" },
  { role: "user" as const, content: "user" },
]

test("cloud completion switches to the next priority channel after upstream 5xx", async () => {
  const calls: string[] = []
  const result = await completeCloudCopywritingText({
    providers: [provider("primary"), provider("backup")],
    messages,
    fetchImpl: (async (url: string | URL | Request) => {
      const current = String(url)
      calls.push(current)
      if (current.includes("primary")) {
        return new Response("unavailable", { status: 503 })
      }
      return Response.json({ choices: [{ message: { content: "backup answer" } }] })
    }) as typeof fetch,
  })

  assert.equal(result.ok, true)
  assert.deepEqual(calls, [
    "https://primary.example/v1/chat/completions",
    "https://backup.example/v1/chat/completions",
  ])
  const success = result as Extract<CloudCopywritingCompletion, { ok: true }>
  assert.equal(success.text, "backup answer")
  assert.equal(success.provider.name, "backup")
  assert.deepEqual(success.failures, [
    { name: "primary", model: "primary-model", status: 503, reason: "http_error" },
  ])
})

test("cloud completion treats invalid responses as recoverable and never exposes keys", async () => {
  const result = await completeCloudCopywritingText({
    providers: [provider("empty"), provider("network")],
    messages,
    fetchImpl: (async (url: string | URL | Request) => {
      if (String(url).includes("empty")) return Response.json({ choices: [] })
      throw new Error("network includes network-secret")
    }) as typeof fetch,
  })

  assert.equal(result.ok, false)
  assert.deepEqual(result.failures.map((failure) => failure.reason), [
    "missing_body",
    "network_error",
  ])
  assert.equal(JSON.stringify(result).includes("secret"), false)
})

test("enterprise knowledge-base UI no longer exposes or submits a model selector", async () => {
  const source = await readFile(
    new URL("../components/geo/geo-skill-generator-panel.tsx", import.meta.url),
    "utf8",
  )

  assert.equal(source.includes("GeoLlmProviderSelect"), false)
  assert.equal(source.includes("LlmProviderId"), false)
  assert.equal(source.includes("大模型"), false)
  assert.doesNotMatch(source, /JSON\.stringify\(\{[\s\S]{0,120}\bprovider\s*,/)
})

test("enterprise knowledge-base API accepts only cloud-distributed candidates", async () => {
  const source = await readFile(
    new URL("../app/api/geo/enterprise-skill/generate/route.ts", import.meta.url),
    "utf8",
  )

  assert.match(source, /listCopywritingProviderCandidates\(\{\s*hasImages:\s*false\s*\}\)/)
  assert.match(source, /candidate\.source\s*===\s*["']cloud["']/)
  assert.match(source, /CLOUD_MODEL_NOT_READY/)
  assert.match(source, /CLOUD_MODEL_UNAVAILABLE/)
  assert.equal(source.includes("VALID_PROVIDERS"), false)
  assert.doesNotMatch(source, /body\.provider/)
})
