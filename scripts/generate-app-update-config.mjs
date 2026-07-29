#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import {
  DEFAULT_UPDATE_FEED_URL,
  DEFAULT_UPDATER_CACHE_DIR_NAME,
  writeAppUpdateConfig,
} from "./lib/app-update-config.mjs"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, "..")

function loadEnvFile(file) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const separator = trimmed.indexOf("=")
    if (separator < 1) continue
    const key = trimmed.slice(0, separator).trim()
    let value = trimmed.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 && process.argv[index + 1]
    ? process.argv[index + 1]
    : fallback
}

loadEnvFile(path.join(projectRoot, ".env.electron-build.local"))
loadEnvFile(path.join(projectRoot, ".env"))

const resourcesDir = path.resolve(
  projectRoot,
  arg("resources", "release/win-unpacked/resources"),
)
const feedUrl =
  arg("feed") ||
  process.env.UPDATE_FEED_URL ||
  process.env.CENTRAL_UPDATE_URL ||
  DEFAULT_UPDATE_FEED_URL
const updaterCacheDirName =
  arg("cache") || DEFAULT_UPDATER_CACHE_DIR_NAME

try {
  const output = writeAppUpdateConfig(resourcesDir, {
    feedUrl,
    updaterCacheDirName,
  })
  console.log(`[generate-app-update-config] OK: ${output}`)
} catch (error) {
  console.error(
    `[generate-app-update-config] FAIL: ${error instanceof Error ? error.message : String(error)}`,
  )
  process.exit(1)
}
