import assert from "node:assert/strict"
import test from "node:test"

import {
  parseAssistantCompletion,
  sanitizeAssistantPageContext,
} from "@/lib/business-assistant/actions"

test("assistant completion only keeps safe, supported suggestions", () => {
  const result = parseAssistantCompletion(
    JSON.stringify({
      text: "先完成脚本，再进入视频生成。",
      suggestedActions: [
        { type: "navigate", label: "去写脚本", view: "视频创作-脚本生成" },
        {
          type: "update_plan",
          label: "采用这份计划",
          steps: [{ stage: "选题与脚本", title: "完成 60 秒脚本" }],
        },
        { type: "generate", label: "直接生成视频" },
        { type: "publish", label: "立即发布" },
      ],
    }),
    ["视频创作-脚本生成"],
  )

  assert.equal(result.text, "先完成脚本，再进入视频生成。")
  assert.deepEqual(
    result.suggestedActions.map((action) => action.type),
    ["navigate", "update_plan"],
  )
})

test("page context strips sensitive and oversized values", () => {
  const context = sanitizeAssistantPageContext({
    activeView: "GEO知识库",
    summary: "正在完善企业实体",
    apiKey: "secret",
    fields: { brand: "招财猫", token: "do-not-send" },
    huge: "x".repeat(5000),
  })

  assert.equal(context.activeView, "GEO知识库")
  assert.equal(context.apiKey, undefined)
  assert.deepEqual(context.fields, { brand: "招财猫" })
  assert.ok(String(context.huge).length <= 500)
})
