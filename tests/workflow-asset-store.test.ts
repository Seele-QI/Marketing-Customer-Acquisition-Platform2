import assert from "node:assert/strict"
import test from "node:test"

import {
  WORKFLOW_ASSET_QUOTA_BYTES,
  dataUrlToBlob,
  newAssetId,
} from "../lib/workflow-asset-store.ts"

test("newAssetId has workflow prefix", () => {
  const id = newAssetId("test")
  assert.ok(id.startsWith("test_"))
})

test("dataUrlToBlob roundtrip mime", () => {
  const blob = dataUrlToBlob("data:text/plain;base64,aGVsbG8=")
  assert.equal(blob.type, "text/plain")
  assert.equal(blob.size, 5)
})

test("WORKFLOW_ASSET_QUOTA_BYTES is 200MB", () => {
  assert.equal(WORKFLOW_ASSET_QUOTA_BYTES, 200 * 1024 * 1024)
})
