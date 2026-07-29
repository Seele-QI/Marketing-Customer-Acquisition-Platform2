import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("rebuilds all runtime resources before packaging Windows", () => {
  const script = readFileSync(path.join(projectRoot, "scripts", "dist-win.mjs"), "utf8")
  const resourcesBuild = script.indexOf("run('pnpm', ['resources:build'])")
  const electronBuild = script.indexOf("run('pnpm', ['electron:build'])")
  const packageDir = script.indexOf("'electron-builder', '--win', '--dir'")

  assert.ok(resourcesBuild >= 0, "dist:win must rebuild Next.js and Python resources")
  assert.ok(resourcesBuild < electronBuild, "resources must be rebuilt before Electron compilation")
  assert.ok(resourcesBuild < packageDir, "resources must be rebuilt before electron-builder copies them")
})
