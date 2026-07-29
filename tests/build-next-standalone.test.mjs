import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("waits for the real Next build process before copying standalone output", () => {
  const script = readFileSync(
    path.join(projectRoot, "scripts", "build-next-standalone.mjs"),
    "utf8",
  )

  assert.match(script, /spawn\(process\.execPath,\s*\[nextCli,\s*['"]build['"]\]/)
  assert.match(
    script,
    /path\.join\(projectRoot,\s*['"]node_modules['"],\s*['"]next['"],\s*['"]dist['"],\s*['"]bin['"],\s*['"]next['"]\)/,
  )
  assert.match(script, /shell:\s*false/)
  assert.doesNotMatch(script, /spawn\(['"]pnpm['"],\s*\[['"]build['"]\]/)
})
