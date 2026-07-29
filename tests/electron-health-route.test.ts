import assert from "node:assert/strict"
import { afterEach, test } from "node:test"
import { GET } from "../app/api/electron-health/route.ts"

const originalGeneration = process.env.ELECTRON_SERVICE_GENERATION

afterEach(() => {
  if (originalGeneration === undefined) delete process.env.ELECTRON_SERVICE_GENERATION
  else process.env.ELECTRON_SERVICE_GENERATION = originalGeneration
})

test("Next electron health echoes only its process generation", async () => {
  process.env.ELECTRON_SERVICE_GENERATION = "generation-next-123"

  const response = await GET()

  assert.equal(response.status, 200)
  assert.equal(response.headers.get("X-Electron-Service-Generation"), "generation-next-123")
  assert.deepEqual(await response.json(), { status: "ok" })
})
