import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const proxySource = readFileSync(new URL("../lib/fastapi-base.ts", import.meta.url), "utf8")
const uiSource = readFileSync(new URL("../components/share-distribute.tsx", import.meta.url), "utf8")

test("multipart proxy preserves the incoming byte stream and boundary", () => {
  const functionSource = proxySource.slice(proxySource.indexOf("export async function proxyMultipartToFastapi"))
  assert.doesNotMatch(functionSource, /req\.formData\(\)/)
  assert.match(functionSource, /const body = await req\.arrayBuffer\(\)/)
  assert.match(functionSource, /headers\.delete\("content-length"\)/)
})

test("distribution video cards use returned covers and video-frame fallback", () => {
  assert.match(uiSource, /thumbnail_url\?: string/)
  assert.match(uiSource, /thumbnail: data\.thumbnail_url \|\| undefined/)
  assert.match(uiSource, /poster=\{thumb \|\| undefined\}/)
  assert.match(uiSource, /#t=0\.1/)
})
