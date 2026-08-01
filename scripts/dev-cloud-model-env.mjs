import { createDecipheriv, hkdfSync } from "node:crypto"
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const SUPPORTED_PROVIDER_KINDS = new Map([
  ["openai_chat", "llm"],
  ["ark_chat", "llm"],
  ["seedance_video", "video"],
  ["xinghe_video", "video"],
])

export class DevCloudConfigError extends Error {
  constructor(message, cause) {
    super(message, cause ? { cause } : undefined)
    this.name = "DevCloudConfigError"
    this.code = "DEV_CLOUD_CONFIG_NOT_READY"
  }
}

export function resolveDevCredentialPath(env = process.env, platform = process.platform) {
  const explicit = String(env.DEV_CLOUD_CREDENTIALS_PATH || "").trim()
  if (explicit) return path.resolve(explicit)
  if (platform === "win32") {
    const appData = String(env.APPDATA || "").trim()
    if (appData) return path.join(appData, "cuocuo-ai", "credentials.bin")
  }
  if (platform === "darwin") {
    return path.join(homedir(), "Library", "Application Support", "cuocuo-ai", "credentials.bin")
  }
  const configRoot = String(env.XDG_CONFIG_HOME || "").trim() || path.join(homedir(), ".config")
  return path.join(configRoot, "cuocuo-ai", "credentials.bin")
}

function resolveMachineId() {
  const { machineIdSync } = require("node-machine-id")
  return machineIdSync(true)
}

function decryptCredentialFile(blob, machineId) {
  if (!Buffer.isBuffer(blob) || blob.length <= 28) throw new Error("credential blob is truncated")
  const key = Buffer.from(hkdfSync("sha256", machineId, "zhongtai-v1-salt", "credentials", 32))
  const decipher = createDecipheriv("aes-256-gcm", key, blob.subarray(0, 12))
  decipher.setAuthTag(blob.subarray(12, 28))
  return Buffer.concat([decipher.update(blob.subarray(28)), decipher.final()]).toString("utf8")
}

function isSupportedProvider(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const expectedKind = SUPPORTED_PROVIDER_KINDS.get(String(value.adapter || "").trim())
  if (!expectedKind || String(value.kind || "").trim() !== expectedKind) return false
  return Number.isFinite(value.id)
    && Boolean(String(value.base_url || "").trim())
    && Boolean(String(value.api_key || "").trim())
    && Boolean(String(value.model || "").trim())
    && Number.isFinite(value.priority)
}

export function loadDevCloudModelEnv({
  baseEnv = process.env,
  credentialsPath = resolveDevCredentialPath(baseEnv),
  machineId,
} = {}) {
  if (!existsSync(credentialsPath)) {
    throw new DevCloudConfigError(
      `未找到云端模型缓存 ${credentialsPath}。请先登录并启动一次桌面客户端，等待云端配置同步完成。`,
    )
  }

  let data
  try {
    const plain = decryptCredentialFile(readFileSync(credentialsPath), machineId || resolveMachineId())
    data = JSON.parse(plain)
  } catch (error) {
    throw new DevCloudConfigError(
      `无法读取云端模型缓存 ${credentialsPath}。请重新登录桌面客户端并等待配置同步后再试。`,
      error,
    )
  }

  const providers = Array.isArray(data?.providers)
    ? data.providers.filter(isSupportedProvider)
    : []
  if (!providers.length) {
    throw new DevCloudConfigError(
      "云端缓存中没有可用的大语言模型或 Seedance 纯模型 API，请检查云端模型配置后重新同步。",
    )
  }

  const snapshot = Buffer.from(JSON.stringify({
    providers,
    version: String(data.config_version || ""),
  }), "utf8").toString("base64")

  return {
    ...baseEnv,
    MODEL_PROVIDERS_JSON_B64: snapshot,
    DESKTOP_RUNTIME: "1",
  }
}
