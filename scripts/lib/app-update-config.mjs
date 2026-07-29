import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import path from "node:path"

export const DEFAULT_UPDATE_FEED_URL =
  "https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/"
export const DEFAULT_UPDATER_CACHE_DIR_NAME = "cuocuo-ai-updater"

export function normalizeFeedUrl(raw) {
  const value = String(raw || "").trim()
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error("更新地址必须是有效的 HTTPS URL")
  }
  if (parsed.protocol !== "https:") {
    throw new Error("更新地址必须使用 HTTPS")
  }
  parsed.hash = ""
  parsed.search = ""
  return `${parsed.toString().replace(/\/+$/, "")}/`
}

function yamlScalar(raw) {
  const value = String(raw || "").trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

export function validateAppUpdateConfig(
  text,
  { expectedCacheDirName = DEFAULT_UPDATER_CACHE_DIR_NAME } = {},
) {
  const fields = {}
  for (const line of String(text || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z][\w-]*)\s*:\s*(.*?)\s*$/)
    if (match) fields[match[1]] = yamlScalar(match[2])
  }

  if (fields.provider !== "generic") {
    throw new Error("app-update.yml provider 必须为 generic")
  }
  const url = normalizeFeedUrl(fields.url)
  if (!fields.updaterCacheDirName) {
    throw new Error("app-update.yml 缺少 updaterCacheDirName")
  }
  if (fields.updaterCacheDirName !== expectedCacheDirName) {
    throw new Error(
      `app-update.yml updaterCacheDirName 必须为 ${expectedCacheDirName}`,
    )
  }

  return {
    provider: "generic",
    url,
    updaterCacheDirName: fields.updaterCacheDirName,
  }
}

export function renderAppUpdateConfig({ feedUrl, updaterCacheDirName }) {
  const url = normalizeFeedUrl(feedUrl)
  const cacheDir = String(updaterCacheDirName || "").trim()
  if (cacheDir !== DEFAULT_UPDATER_CACHE_DIR_NAME) {
    throw new Error(
      `updaterCacheDirName 必须为 ${DEFAULT_UPDATER_CACHE_DIR_NAME}`,
    )
  }
  return [
    "provider: generic",
    `url: ${url}`,
    `updaterCacheDirName: ${cacheDir}`,
    "",
  ].join("\n")
}

export function writeAppUpdateConfig(
  resourcesDir,
  {
    feedUrl = DEFAULT_UPDATE_FEED_URL,
    updaterCacheDirName = DEFAULT_UPDATER_CACHE_DIR_NAME,
  } = {},
) {
  const targetDir = path.resolve(resourcesDir)
  mkdirSync(targetDir, { recursive: true })
  const target = path.join(targetDir, "app-update.yml")
  const temp = path.join(
    targetDir,
    `.app-update.yml.${process.pid}.${Date.now()}.tmp`,
  )
  const content = renderAppUpdateConfig({ feedUrl, updaterCacheDirName })

  try {
    writeFileSync(temp, content, "utf8")
    validateAppUpdateConfig(readFileSync(temp, "utf8"), {
      expectedCacheDirName: updaterCacheDirName,
    })
    if (existsSync(target)) rmSync(target, { force: true })
    renameSync(temp, target)
    validateAppUpdateConfig(readFileSync(target, "utf8"), {
      expectedCacheDirName: updaterCacheDirName,
    })
    return target
  } finally {
    if (existsSync(temp)) rmSync(temp, { force: true })
  }
}
