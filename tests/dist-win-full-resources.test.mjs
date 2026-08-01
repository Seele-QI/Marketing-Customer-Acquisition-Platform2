import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("rebuilds all runtime resources before packaging Windows", () => {
  const script = readFileSync(path.join(projectRoot, "scripts", "dist-win.mjs"), "utf8")
  const resourcesBuild = script.indexOf("run('pnpm', ['resources:build'])")
  const preflight = script.indexOf("run('pnpm', ['preflight'])")
  const electronBuild = script.indexOf("run('pnpm', ['electron:build'])")
  const packageDir = script.indexOf("'electron-builder', '--win', '--dir'")

  assert.ok(resourcesBuild >= 0, "dist:win must rebuild Next.js and Python resources")
  assert.ok(preflight >= 0, "dist:win must verify runtime source coherence before packaging")
  assert.ok(resourcesBuild < electronBuild, "resources must be rebuilt before Electron compilation")
  assert.ok(resourcesBuild < preflight, "preflight must run after runtime resources are rebuilt")
  assert.ok(preflight < packageDir, "preflight must pass before electron-builder copies resources")
  assert.ok(resourcesBuild < packageDir, "resources must be rebuilt before electron-builder copies them")
})

test("standalone resource refresh also synchronizes Python application sources", () => {
  const script = readFileSync(
    path.join(projectRoot, "scripts", "build-next-standalone.mjs"),
    "utf8",
  )

  assert.match(script, /function syncPythonApplicationSources\(/)
  assert.match(script, /syncPythonApplicationSources\(\)/)
  assert.match(script, /resources['"], ['"]python['"], ['"]lib/)
  assert.match(script, /resources['"], ['"]runtime['"], ['"]darwin-arm64['"], ['"]python['"], ['"]applib['"], ['"]lib/)
})

test("preflight compares packaged Python application sources with the repository", () => {
  const script = readFileSync(path.join(projectRoot, "scripts", "preflight.mjs"), "utf8")

  assert.match(script, /['"]runninghub_client\.py['"]/)
  assert.match(script, /['"]runninghub_network\.py['"]/)
  assert.match(script, /createHash\(['"]sha256['"]\)/)
})
