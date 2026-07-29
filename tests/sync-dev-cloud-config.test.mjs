import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import {
  decryptCredentialBlob,
  syncDevCloudConfig,
} from "../scripts/sync-dev-cloud-config.mjs"

test("syncDevCloudConfig saves the complete cloud snapshot without logging secrets", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sync-dev-cloud-"))
  const credentialsPath = path.join(root, "credentials.bin")
  const logs = []
  const provider = {
    id: 9,
    name: "企业智能体 DeepSeek 快速通道",
    kind: "llm",
    adapter: "openai_chat",
    base_url: "https://example.invalid/v1",
    api_key: "secret-provider-key",
    model: "deepseek-v4-flash",
    priority: 15,
    extra: {
      purpose: "enterprise_agent",
      performance_tier: "fast",
      supports_images: false,
    },
  }
  const responses = [
    new Response("{}", {
      status: 200,
      headers: { "set-cookie": "session_id=test-session; Path=/; HttpOnly" },
    }),
    Response.json({
      config_version: "cfg_db_36_test",
      keys: { NEWAPI_KEY: "secret-pool-key" },
      providers: [provider],
      features: [],
    }),
  ]

  const result = await syncDevCloudConfig({
    cloudUrl: "https://cloud.example",
    loginName: "tester",
    password: "password",
    credentialsPath,
    machineId: "machine-for-test",
    fetchImpl: async () => responses.shift(),
    logger: { log: (...args) => logs.push(args.join(" ")) },
  })

  assert.deepEqual(result, {
    configVersion: "cfg_db_36_test",
    providerCount: 1,
    credentialPath: credentialsPath,
    backupPath: null,
  })
  const stored = JSON.parse(decryptCredentialBlob(
    readFileSync(credentialsPath),
    "machine-for-test",
  ))
  assert.equal(stored.config_version, "cfg_db_36_test")
  assert.equal(stored.providers[0].api_key, "secret-provider-key")
  assert.equal(stored.keys.NEWAPI_KEY, "secret-pool-key")
  assert.equal(logs.some((line) => line.includes("secret-provider-key")), false)
  assert.equal(logs.some((line) => line.includes("secret-pool-key")), false)
})

test("syncDevCloudConfig rejects an incomplete provider snapshot", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "sync-dev-cloud-invalid-"))
  const responses = [
    new Response("{}", {
      status: 200,
      headers: { "set-cookie": "session_id=test-session; Path=/; HttpOnly" },
    }),
    Response.json({
      config_version: "cfg_bad",
      keys: {},
      providers: [{ id: 9, kind: "llm" }],
    }),
  ]

  await assert.rejects(
    syncDevCloudConfig({
      cloudUrl: "https://cloud.example",
      loginName: "tester",
      password: "password",
      credentialsPath: path.join(root, "credentials.bin"),
      machineId: "machine-for-test",
      fetchImpl: async () => responses.shift(),
      logger: { log() {} },
    }),
    /invalid provider snapshot/i,
  )
})
