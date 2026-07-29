import test from "node:test"
import assert from "node:assert/strict"
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const script = path.join(projectRoot, "scripts", "repair-desktop-updater.ps1")

function runRepair(installDir) {
  return spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      script,
      "-InstallDir",
      installDir,
    ],
    { encoding: "utf8" },
  )
}

test("repairs a validated install and backs up a different existing config", () => {
  const root = mkdtempSync(path.join(tmpdir(), "repair-desktop-updater-"))
  const installDir = path.join(root, "cuocuo-ai")
  const resourcesDir = path.join(installDir, "resources")
  const configPath = path.join(resourcesDir, "app-update.yml")
  try {
    mkdirSync(resourcesDir, { recursive: true })
    writeFileSync(path.join(installDir, "招财猫.exe"), "fixture", "utf8")

    const first = runRepair(installDir)
    assert.equal(first.status, 0, first.stderr || first.stdout)
    assert.equal(
      readFileSync(configPath, "utf8"),
      [
        "provider: generic",
        "url: https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/",
        "updaterCacheDirName: cuocuo-ai-updater",
        "",
      ].join("\n"),
    )

    writeFileSync(configPath, "provider: broken\n", "utf8")
    const second = runRepair(installDir)
    assert.equal(second.status, 0, second.stderr || second.stdout)
    const backups = readdirSync(resourcesDir).filter((name) =>
      /^app-update\.yml\.bak-\d{8}-\d{6}$/.test(name),
    )
    assert.equal(backups.length, 1)
    assert.equal(readFileSync(path.join(resourcesDir, backups[0]), "utf8"), "provider: broken\n")
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("refuses an unvalidated install directory", () => {
  const root = mkdtempSync(path.join(tmpdir(), "repair-desktop-updater-invalid-"))
  try {
    const result = runRepair(root)
    assert.notEqual(result.status, 0)
    assert.equal(readdirSync(root).length, 0)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
