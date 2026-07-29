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
import { fileURLToPath } from "node:url"
import {
  normalizeFeedUrl,
  renderAppUpdateConfig,
  validateAppUpdateConfig,
  writeAppUpdateConfig,
} from "../scripts/lib/app-update-config.mjs"
import {
  artifactUrl,
  oldArtifactName,
  pickReleaseArtifacts,
} from "../scripts/lib/release-artifacts.mjs"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const releaseAnnouncement =
  "修复 GEO 内容矩阵生成成功却误报失败的问题，提升长耗时生成结果返回稳定性。"

test("normalizes an HTTPS generic feed and writes a valid config atomically", () => {
  const root = mkdtempSync(path.join(tmpdir(), "app-update-config-"))
  try {
    const file = writeAppUpdateConfig(root, {
      feedUrl: "https://updates.example.com/releases",
      updaterCacheDirName: "cuocuo-ai-updater",
    })
    const text = readFileSync(file, "utf8")

    assert.equal(
      normalizeFeedUrl("https://updates.example.com/releases"),
      "https://updates.example.com/releases/",
    )
    assert.equal(
      text,
      renderAppUpdateConfig({
        feedUrl: "https://updates.example.com/releases/",
        updaterCacheDirName: "cuocuo-ai-updater",
      }),
    )
    assert.deepEqual(validateAppUpdateConfig(text), {
      provider: "generic",
      url: "https://updates.example.com/releases/",
      updaterCacheDirName: "cuocuo-ai-updater",
    })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("rejects a non-HTTPS feed", () => {
  assert.throws(
    () => normalizeFeedUrl("http://updates.example.com/releases"),
    /HTTPS/,
  )
})

test("rejects missing or unexpected updater fields", () => {
  assert.throws(
    () =>
      validateAppUpdateConfig(
        "provider: github\nurl: https://updates.example.com/\nupdaterCacheDirName: wrong-updater\n",
      ),
    /provider/,
  )
  assert.throws(
    () => validateAppUpdateConfig("provider: generic\nurl: https://updates.example.com/\n"),
    /updaterCacheDirName/,
  )
})

test("rejects a Windows release without the matching blockmap", () => {
  const root = mkdtempSync(path.join(tmpdir(), "release-artifacts-incomplete-"))
  try {
    writeFileSync(path.join(root, "招财猫-Setup-1.3.6.exe"), "installer")
    writeFileSync(
      path.join(root, "latest.yml"),
      "version: 1.3.6\npath: 招财猫-Setup-1.3.6.exe\n",
    )
    assert.throws(() => pickReleaseArtifacts(root), /blockmap/)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("orders binaries and blockmaps before latest metadata", () => {
  const root = mkdtempSync(path.join(tmpdir(), "release-artifacts-complete-"))
  try {
    mkdirSync(root, { recursive: true })
    for (const name of [
      "招财猫-Setup-1.3.6.exe",
      "招财猫-Setup-1.3.6.exe.blockmap",
      "招财猫-Setup-1.3.5.exe",
      "招财猫-Setup-1.3.5.exe.blockmap",
    ]) {
      writeFileSync(path.join(root, name), name)
    }
    writeFileSync(
      path.join(root, "latest.yml"),
      "version: 1.3.6\npath: 招财猫-Setup-1.3.6.exe\n",
    )

    assert.deepEqual(
      pickReleaseArtifacts(root).map((file) => path.basename(file)),
      [
        "招财猫-Setup-1.3.6.exe",
        "招财猫-Setup-1.3.6.exe.blockmap",
        "latest.yml",
      ],
    )
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test("builds encoded artifact URLs and derives the retained old blockmap name", () => {
  assert.equal(
    artifactUrl(
      "https://updates.example.com/releases/",
      "招财猫-Setup-1.3.6.exe.blockmap",
    ),
    "https://updates.example.com/releases/%E6%8B%9B%E8%B4%A2%E7%8C%AB-Setup-1.3.6.exe.blockmap",
  )
  assert.equal(
    oldArtifactName("招财猫-Setup-1.3.6.exe", "1.3.6", "0.1.3"),
    "招财猫-Setup-0.1.3.exe",
  )
  assert.throws(
    () => oldArtifactName("招财猫-Setup-current.exe", "1.3.6", "0.1.3"),
    /1\.3\.6/,
  )
})

test("keeps desktop 1.3.8 version and concise release notes in sync", () => {
  const pkg = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"))
  const builder = readFileSync(path.join(projectRoot, "electron-builder.yml"), "utf8")

  assert.equal(pkg.version, "1.3.8")
  assert.match(builder, /^\s*version:\s*1\.3\.8\s*$/m)
  assert.ok(builder.includes(releaseAnnouncement))
})
