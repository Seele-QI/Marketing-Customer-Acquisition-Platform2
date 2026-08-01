import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import test from "node:test"
import sharp from "sharp"

import { AGENT_DEFINITIONS } from "../lib/agents/registry.ts"

test("every enterprise role has a square original PNG portrait", async () => {
  for (const agent of AGENT_DEFINITIONS) {
    assert.match(agent.avatar, /^\/agents\/company\/[a-z0-9-]+\.png$/)
    const file = path.join(process.cwd(), "public", agent.avatar.replace(/^\//, ""))
    assert.ok(fs.existsSync(file), `${agent.id} portrait missing`)
    const metadata = await sharp(file).metadata()
    assert.equal(metadata.format, "png")
    assert.equal(metadata.width, metadata.height)
    assert.ok((metadata.width ?? 0) >= 256)
  }
})
