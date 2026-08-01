import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ensureUpdateConfigPath } from "../electron/services/update-config.ts"

const validConfig = [
  "provider: generic",
  "url: https://updates.example.com/releases/",
  "updaterCacheDirName: cuocuo-ai-updater",
  "",
].join("\n")

test("keeps a valid packaged app-update.yml", () => {
  const root = mkdtempSync(path.join(tmpdir(), "electron-update-config-"))
  try {
    const packaged = path.join(root, "resources", "app-update.yml")
    mkdirSync(path.dirname(packaged), { recursive: true })
    writeFileSync(packaged, validConfig, "utf8")

    const result = ensureUpdateConfigPath({
      packagedConfigPath: packaged,
      fallbackConfigPath: path.join(root, "user-data", "app-update.yml"),
      feedUrl: "https://updates.example.com/releases/",
    })

    assert.deepEqual(result, { path: packaged, source: "packaged" })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("creates a user-data fallback when packaged config is missing", () => {
  const root = mkdtempSync(path.join(tmpdir(), "electron-update-config-"))
  try {
    const fallback = path.join(root, "user-data", "updater", "app-update.yml")
    const result = ensureUpdateConfigPath({
      packagedConfigPath: path.join(root, "resources", "app-update.yml"),
      fallbackConfigPath: fallback,
      feedUrl: "https://updates.example.com/releases",
    })

    assert.deepEqual(result, { path: fallback, source: "fallback" })
    assert.equal(readFileSync(fallback, "utf8"), validConfig)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects fallback creation without an HTTPS feed", () => {
  const root = mkdtempSync(path.join(tmpdir(), "electron-update-config-"))
  try {
    assert.throws(
      () =>
        ensureUpdateConfigPath({
          packagedConfigPath: path.join(root, "resources", "app-update.yml"),
          fallbackConfigPath: path.join(root, "user-data", "app-update.yml"),
          feedUrl: "",
        }),
      /更新配置缺失/,
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
