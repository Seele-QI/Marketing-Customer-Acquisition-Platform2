import assert from "node:assert/strict"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test } from "node:test"
import { saveCredentials, loadCredentials, type SyncedProvider } from "../electron/services/credential-store.ts"
import { injectApiKeys } from "../electron/services/env-injector.ts"
import { loadDotEnv } from "../electron/services/env-loader.ts"
import { syncConfig } from "../electron/services/config-sync-client.ts"

test("provider-only credentials survive save/load and inject one coherent snapshot", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "provider-credentials-"))
  const previous = process.env.TEST_ELECTRON_USER_DATA
  const previousCloud = process.env.CLOUD_API_URL
  process.env.TEST_ELECTRON_USER_DATA = userData
  process.env.CLOUD_API_URL = "https://cloud.example"
  const provider: SyncedProvider = {
    id: 7,
    kind: "llm",
    name: "cloud-provider",
    adapter: "openai",
    base_url: "https://provider.example/v1",
    api_key: "provider-secret",
    model: "model-v2",
    priority: 1,
  }

  try {
    saveCredentials({
      machine_id: "ignored-on-load",
      config_version: "cfg-provider-only",
      synced_at: Date.now(),
      keys: {},
      providers: [provider],
    })

    const loaded = loadCredentials()
    assert.equal(loaded?.config_version, "cfg-provider-only")
    assert.deepEqual(loaded?.providers, [provider])

    const stalePayload = Buffer.from(JSON.stringify({
      version: "cfg-stale-base",
      providers: [{ ...provider, id: 999, name: "stale-provider", model: "stale-model" }],
    }), "utf8").toString("base64")
    const injected = await injectApiKeys({
      NODE_ENV: "production",
      MODEL_PROVIDERS_JSON_B64: stalePayload,
    })
    const decoded = JSON.parse(Buffer.from(injected.MODEL_PROVIDERS_JSON_B64, "base64").toString("utf8"))
    assert.equal(decoded.version, "cfg-provider-only")
    assert.deepEqual(decoded.providers, [provider])

    let requestBody: any
    const syncResult = await syncConfig({
      isDestroyed: () => false,
      webContents: {
        session: { cookies: { get: async () => [{ name: "session_id", value: "session-secret" }] } },
      },
    } as any, "http://127.0.0.1:3000", {
      fetchImpl: async (_input, init) => {
        requestBody = JSON.parse(String(init?.body))
        return new Response(JSON.stringify({
          unchanged: true,
          config_version: "cfg-provider-only",
        }), { status: 200 })
      },
    })
    assert.equal(syncResult.ok, true)
    assert.equal(requestBody.known_version, "cfg-provider-only")

    const explicitPayload = Buffer.from(JSON.stringify({
      version: "cfg-explicit-key",
      providers: [{ ...provider, id: 10, name: "explicit-provider" }],
    }), "utf8").toString("base64")
    saveCredentials({
      machine_id: "ignored-on-load",
      config_version: "cfg-explicit-key",
      synced_at: Date.now(),
      keys: { MODEL_PROVIDERS_JSON_B64: explicitPayload },
      providers: [provider],
    })
    const explicitlyInjected = await injectApiKeys({
      NODE_ENV: "production",
      MODEL_PROVIDERS_JSON_B64: stalePayload,
    })
    const explicitDecoded = JSON.parse(Buffer.from(
      explicitlyInjected.MODEL_PROVIDERS_JSON_B64,
      "base64",
    ).toString("utf8"))
    assert.equal(explicitDecoded.version, "cfg-explicit-key")
    assert.equal(explicitDecoded.providers[0].name, "explicit-provider")
  } finally {
    if (previous === undefined) delete process.env.TEST_ELECTRON_USER_DATA
    else process.env.TEST_ELECTRON_USER_DATA = previous
    if (previousCloud === undefined) delete process.env.CLOUD_API_URL
    else process.env.CLOUD_API_URL = previousCloud
    rmSync(userData, { recursive: true, force: true })
  }
})

test("local RunningHub credentials remain authoritative over cloud snapshots", async () => {
  const userData = mkdtempSync(path.join(tmpdir(), "image-credentials-"))
  const previous = process.env.TEST_ELECTRON_USER_DATA
  process.env.TEST_ELECTRON_USER_DATA = userData
  try {
    saveCredentials({
      machine_id: "ignored-on-load",
      config_version: "cfg-image-overseas",
      synced_at: Date.now(),
      keys: {
        RUNNINGHUB_API_KEY: "stale-cloud-video-key",
        RUNNINGHUB_IMAGE_API_KEY: "stale-cloud-image-key",
        RUNNINGHUB_IMAGE_BASE_URL: "https://stale-cloud.example/openapi/v2",
      },
    })

    const local = loadDotEnv()
    assert.ok(local.RUNNINGHUB_API_KEY)
    assert.ok(local.RUNNINGHUB_IMAGE_API_KEY)
    assert.ok(local.RUNNINGHUB_IMAGE_BASE_URL)
    const injected = await injectApiKeys({ NODE_ENV: "production" })
    assert.equal(injected.RUNNINGHUB_API_KEY, local.RUNNINGHUB_API_KEY)
    assert.equal(injected.RUNNINGHUB_IMAGE_API_KEY, local.RUNNINGHUB_IMAGE_API_KEY)
    assert.equal(injected.RUNNINGHUB_IMAGE_BASE_URL, local.RUNNINGHUB_IMAGE_BASE_URL)
  } finally {
    if (previous === undefined) delete process.env.TEST_ELECTRON_USER_DATA
    else process.env.TEST_ELECTRON_USER_DATA = previous
    rmSync(userData, { recursive: true, force: true })
  }
})
