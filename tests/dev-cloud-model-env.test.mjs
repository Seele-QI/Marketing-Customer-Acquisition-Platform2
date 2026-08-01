import assert from "node:assert/strict"
import { createCipheriv, hkdfSync } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import test from "node:test"

import { loadDevCloudModelEnv } from "../scripts/dev-cloud-model-env.mjs"

function encryptCredentials(payload, machineId) {
  const key = Buffer.from(hkdfSync("sha256", machineId, "zhongtai-v1-salt", "credentials", 32))
  const iv = Buffer.alloc(12, 7)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
}

function provider(id, kind, adapter) {
  return {
    id,
    kind,
    name: `${adapter}-${id}`,
    adapter,
    base_url: `https://${adapter}.example/v1`,
    api_key: `secret-${id}`,
    model: `model-${id}`,
    priority: id,
  }
}

test("development env injects only cloud LLM and Seedance providers", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-cloud-model-"))
  const credentialsPath = path.join(root, "credentials.bin")
  const machineId = "test-machine-id-with-enough-entropy"
  const payload = {
    machine_id: machineId,
    config_version: "cfg-dev-1",
    synced_at: Date.now(),
    keys: {
      RUNNINGHUB_API_KEY: "cloud-runninghub-must-not-win",
      ARK_IMAGE_API_KEY: "cloud-image-must-not-win",
    },
    providers: [
      provider(1, "llm", "openai_chat"),
      provider(2, "llm", "ark_chat"),
      provider(3, "video", "seedance_video"),
      provider(4, "video", "xinghe_video"),
      provider(5, "workflow", "runninghub"),
      provider(6, "image", "ark_image"),
    ],
  }
  writeFileSync(credentialsPath, encryptCredentials(payload, machineId))

  try {
    const env = loadDevCloudModelEnv({
      baseEnv: {
        RUNNINGHUB_API_KEY: "built-in-runninghub",
        ARK_IMAGE_API_KEY: "built-in-image",
      },
      credentialsPath,
      machineId,
    })
    const snapshot = JSON.parse(Buffer.from(env.MODEL_PROVIDERS_JSON_B64, "base64").toString("utf8"))

    assert.equal(snapshot.version, "cfg-dev-1")
    assert.deepEqual(snapshot.providers.map((item) => item.adapter), [
      "openai_chat",
      "ark_chat",
      "seedance_video",
      "xinghe_video",
    ])
    assert.equal(env.RUNNINGHUB_API_KEY, "built-in-runninghub")
    assert.equal(env.ARK_IMAGE_API_KEY, "built-in-image")
    assert.equal(env.DESKTOP_RUNTIME, "1")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("development env rejects a missing cloud credential cache", () => {
  assert.throws(
    () => loadDevCloudModelEnv({
      baseEnv: {},
      credentialsPath: path.join(tmpdir(), `missing-cloud-${Date.now()}`, "credentials.bin"),
      machineId: "unused-machine-id",
    }),
    (error) => error?.code === "DEV_CLOUD_CONFIG_NOT_READY"
      && /credentials\.bin/.test(error.message)
      && /桌面客户端/.test(error.message),
  )
})

test("development env rejects a cache without supported pure-model providers", () => {
  const root = mkdtempSync(path.join(tmpdir(), "dev-cloud-empty-"))
  const credentialsPath = path.join(root, "credentials.bin")
  const machineId = "test-machine-id-with-enough-entropy"
  writeFileSync(credentialsPath, encryptCredentials({
    config_version: "cfg-workflow-only",
    synced_at: Date.now(),
    keys: {},
    providers: [provider(5, "workflow", "runninghub"), provider(6, "image", "ark_image")],
  }, machineId))

  try {
    assert.throws(
      () => loadDevCloudModelEnv({ baseEnv: {}, credentialsPath, machineId }),
      (error) => error?.code === "DEV_CLOUD_CONFIG_NOT_READY"
        && /大语言模型或 Seedance/.test(error.message),
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
