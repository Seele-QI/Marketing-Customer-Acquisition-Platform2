#!/usr/bin/env node

import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto"
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { createRequire } from "node:module"

import { resolveDevCredentialPath } from "./dev-cloud-model-env.mjs"

const require = createRequire(import.meta.url)
const SESSION_COOKIE = "session_id"
const DEFAULT_CLOUD_URL = "https://mcap-cloud-api.preview.aliyun-zeabur.cn"

function deriveKey(machineId) {
  return Buffer.from(hkdfSync(
    "sha256",
    machineId,
    "zhongtai-v1-salt",
    "credentials",
    32,
  ))
}

export function encryptCredentialText(text, machineId, iv = randomBytes(12)) {
  const cipher = createCipheriv("aes-256-gcm", deriveKey(machineId), iv)
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}

export function decryptCredentialBlob(blob, machineId) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(machineId),
    blob.subarray(0, 12),
  )
  decipher.setAuthTag(blob.subarray(12, 28))
  return Buffer.concat([
    decipher.update(blob.subarray(28)),
    decipher.final(),
  ]).toString("utf8")
}

function parseSessionCookie(header) {
  const match = String(header || "").match(/(?:^|,\s*)session_id=([^;,\s]+)/i)
  return match ? `${SESSION_COOKIE}=${match[1]}` : ""
}

function isValidProvider(provider) {
  return provider
    && typeof provider === "object"
    && Number.isFinite(provider.id)
    && typeof provider.name === "string"
    && typeof provider.kind === "string"
    && typeof provider.adapter === "string"
    && typeof provider.base_url === "string"
    && Boolean(provider.base_url.trim())
    && typeof provider.api_key === "string"
    && Boolean(provider.api_key.trim())
    && typeof provider.model === "string"
    && Boolean(provider.model.trim())
    && Number.isFinite(provider.priority)
}

async function responseMessage(response) {
  const text = await response.text()
  try {
    const body = JSON.parse(text)
    return String(body.detail || body.message || response.status)
  } catch {
    return String(response.status)
  }
}

export async function syncDevCloudConfig({
  cloudUrl,
  loginName,
  password,
  credentialsPath = resolveDevCredentialPath(),
  machineId,
  fetchImpl = fetch,
  logger = console,
} = {}) {
  if (!loginName || !password) {
    throw new Error("TEST_LOGIN_NAME and TEST_PASSWORD are required")
  }
  const base = String(cloudUrl || DEFAULT_CLOUD_URL).replace(/\/+$/, "")
  const login = await fetchImpl(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_name: loginName, password }),
  })
  if (!login.ok) {
    throw new Error(`cloud login failed: ${await responseMessage(login)}`)
  }
  const cookie = parseSessionCookie(login.headers.get("set-cookie"))
  if (!cookie) throw new Error("cloud login returned no session cookie")

  const sync = await fetchImpl(`${base}/api/config/sync`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: JSON.stringify({ client_version: "0.1.0", known_version: "" }),
  })
  if (!sync.ok) {
    throw new Error(`cloud config sync failed: ${await responseMessage(sync)}`)
  }
  const snapshot = await sync.json()
  const providers = Array.isArray(snapshot?.providers) ? snapshot.providers : []
  if (!providers.length || !providers.every(isValidProvider)) {
    throw new Error("invalid provider snapshot returned by cloud")
  }
  const configVersion = String(snapshot.config_version || "").trim()
  if (!configVersion) throw new Error("cloud config snapshot has no version")

  const resolvedMachineId = machineId || require("node-machine-id").machineIdSync(true)
  const payload = {
    machine_id: resolvedMachineId,
    config_version: configVersion,
    synced_at: Date.now(),
    keys: snapshot.keys && typeof snapshot.keys === "object" ? snapshot.keys : {},
    providers,
    ...(Array.isArray(snapshot.features) ? { features: snapshot.features } : {}),
  }
  const target = path.resolve(credentialsPath)
  mkdirSync(path.dirname(target), { recursive: true })
  let backupPath = null
  if (existsSync(target)) {
    const current = JSON.parse(decryptCredentialBlob(readFileSync(target), resolvedMachineId))
    const currentVersion = String(current?.config_version || "unknown").replace(/[^a-zA-Z0-9_.-]/g, "_")
    backupPath = `${target}.${currentVersion}.bak`
    if (!existsSync(backupPath)) copyFileSync(target, backupPath)
  }
  const temporary = `${target}.${process.pid}.tmp`
  writeFileSync(
    temporary,
    encryptCredentialText(JSON.stringify(payload), resolvedMachineId),
    { flag: "wx" },
  )
  renameSync(temporary, target)
  logger.log(
    `[cloud-sync] saved ${configVersion}; providers=${providers.length}; ` +
      `backup=${backupPath ? "yes" : "no"}`,
  )
  return {
    configVersion,
    providerCount: providers.length,
    credentialPath: target,
    backupPath,
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : ""
if (invokedPath === import.meta.url) {
  syncDevCloudConfig({
    cloudUrl: process.env.CLOUD_API_URL,
    loginName: process.env.TEST_LOGIN_NAME,
    password: process.env.TEST_PASSWORD,
  }).catch((error) => {
    console.error(`[cloud-sync] ${error?.message || String(error)}`)
    process.exitCode = 1
  })
}
