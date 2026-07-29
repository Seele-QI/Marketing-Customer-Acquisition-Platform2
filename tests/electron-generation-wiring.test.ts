import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

test("all Electron Next and FastAPI child specs require generation health", () => {
  const source = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8")
  assert.equal(source.match(/generationHealthCheck:\s*true/g)?.length, 4)
  assert.equal(source.match(/\/api\/electron-health/g)?.length, 2)
  assert.equal(source.match(/healthUrl:\s*`http:\/\/127\.0\.0\.1:\$\{uvicornPort\}\/health`/g)?.length, 2)
})
