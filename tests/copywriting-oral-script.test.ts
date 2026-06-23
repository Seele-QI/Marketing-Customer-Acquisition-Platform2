import assert from "node:assert/strict"
import test from "node:test"

import {
  buildCopywritingEnrichedSystemPrompt,
  COPYWRITING_PURE_ORAL_RULES,
  resolveAgentSystemPrompt,
} from "../lib/prompts/copywriting-agent-systems.ts"
import {
  sanitizeCopywritingPlainScript,
  splitCopywritingScriptVersions,
} from "../lib/copywriting-script-format.ts"

test("固定角色提示词统一追加纯口播规则", () => {
  const prompt = resolveAgentSystemPrompt("实体店获客脚本创作")

  assert.match(prompt, /只输出可直接朗读的纯口播稿正文/)
  assert.match(prompt, /严禁输出任何括号内容/)
  assert.ok(prompt.includes(COPYWRITING_PURE_ORAL_RULES.trim()))
})

test("兜底角色提示词也会追加纯口播规则", () => {
  const prompt = resolveAgentSystemPrompt("自定义角色")

  assert.match(prompt, /你是「自定义角色」/)
  assert.match(prompt, /严禁输出任何括号内容/)
  assert.ok(prompt.includes(COPYWRITING_PURE_ORAL_RULES.trim()))
})

test("enriched system prompt 会拼入口播规则与附加上下文", () => {
  const prompt = buildCopywritingEnrichedSystemPrompt({
    agentName: "高效口播脚本",
    workflowKnowledge: "工作流知识",
    memoryContext: "用户记忆",
  })

  assert.ok(prompt.includes(COPYWRITING_PURE_ORAL_RULES.trim()))
  assert.ok(prompt.includes("工作流知识"))
  assert.ok(prompt.includes("用户记忆"))
})

test("爆款脚本洗稿允许内部分析但最终只输出成稿", () => {
  const prompt = resolveAgentSystemPrompt("爆款脚本洗稿")

  assert.match(prompt, /可先在内部完成爆款逻辑分析/)
  assert.match(prompt, /最终只输出原创改写后的口播成稿/)
  assert.doesNotMatch(prompt, /先简要分析其爆款逻辑再给改写稿/)
})

test("按 Markdown 版本标题拆分多版本口播稿", () => {
  const versions = splitCopywritingScriptVersions(`
## 版本一

姐妹们，装修最怕的不是超预算，是一开始就做错顺序。

## 版本二

你如果第一次装修，先别急着买材料，先把水电和尺寸想明白。
`)

  assert.equal(versions.length, 2)
  assert.equal(versions[0]?.title, "版本一")
  assert.equal(versions[0]?.plainText, "姐妹们，装修最怕的不是超预算，是一开始就做错顺序。")
  assert.equal(versions[1]?.title, "版本二")
  assert.equal(versions[1]?.plainText, "你如果第一次装修，先别急着买材料，先把水电和尺寸想明白。")
})

test("未命中版本标题时回退为单版本结果", () => {
  const versions = splitCopywritingScriptVersions(`
这是一条单版本口播稿。

记住，预算要先分配，再谈风格。
`)

  assert.equal(versions.length, 1)
  assert.equal(versions[0]?.title, null)
  assert.equal(versions[0]?.plainText, "这是一条单版本口播稿。\n\n记住，预算要先分配，再谈风格。")
})

test("净化时删除提示型括号和说明性段落，但保留应朗读的括号正文", () => {
  const plainText = sanitizeCopywritingPlainScript(`
## 版本一

（语气放缓）真正省钱的装修，不是少买东西，而是少返工。

[镜头切换]

说明：这一版适合门店获客。

你一定要记住，先定尺寸，再买柜子。

这一步（真的很重要），能帮你省下很多冤枉钱。
`)

  assert.equal(
    plainText,
    "真正省钱的装修，不是少买东西，而是少返工。\n\n你一定要记住，先定尺寸，再买柜子。\n\n这一步（真的很重要），能帮你省下很多冤枉钱。",
  )
})

test("净化时会移除列表符号与标签化说明行", () => {
  const plainText = sanitizeCopywritingPlainScript(`
- 适用场景：家装门店短视频
- 记住，先看报价单，再谈升级项。
1. 别被低价套餐带节奏。
2. 你要盯住增项和损耗。
`)

  assert.equal(plainText, "记住，先看报价单，再谈升级项。\n别被低价套餐带节奏。\n你要盯住增项和损耗。")
})

test("净化为空时仍保留版本卡片所需结构，供前端提示重新生成", () => {
  const versions = splitCopywritingScriptVersions(`
## 版本一

（语气放缓）

## 版本二

[镜头切换]
`)

  assert.equal(versions.length, 2)
  assert.equal(versions[0]?.title, "版本一")
  assert.equal(versions[0]?.plainText, "")
  assert.equal(versions[1]?.title, "版本二")
  assert.equal(versions[1]?.plainText, "")
})
