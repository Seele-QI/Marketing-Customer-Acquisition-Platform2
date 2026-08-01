import assert from "node:assert/strict"
import test from "node:test"

import {
  getBusinessAssistant,
  listEnabledBusinessAssistants,
  resolveAssistantForView,
} from "../lib/business-assistant/registry.ts"

test("only video and GEO business assistants are enabled", () => {
  assert.deepEqual(
    listEnabledBusinessAssistants().map((item) => item.id),
    ["video-creation", "geo-growth"],
  )
  assert.equal(
    getBusinessAssistant("douyin-interception")?.availability,
    "reserved",
  )
})

test("view routing never invents an unsupported assistant", () => {
  assert.equal(
    resolveAssistantForView("数字人视频创作（新）")?.id,
    "video-creation",
  )
  assert.equal(
    resolveAssistantForView("企业知识库搭建")?.id,
    "geo-growth",
  )
  assert.equal(resolveAssistantForView("图片工作台"), undefined)
  assert.equal(resolveAssistantForView("身份定位"), undefined)
  assert.equal(resolveAssistantForView("抖音截流"), undefined)
})
