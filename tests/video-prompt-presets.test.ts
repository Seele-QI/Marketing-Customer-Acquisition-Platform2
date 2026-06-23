import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_MODE_LABELS,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
} from "../lib/video/video-prompt-presets.ts"

test("默认模式是自然模式且返回 11 行提示词", () => {
  assert.equal(DEFAULT_VIDEO_PROMPT_MODE, "natural")
  const lines = VIDEO_PROMPT_PRESETS.natural.split("\n")
  assert.equal(lines.length, 11)
})

test("空提示词会回退到自然模式", () => {
  assert.equal(resolveVideoPrompt(""), VIDEO_PROMPT_PRESETS.natural)
  assert.equal(resolveVideoPrompt("   "), VIDEO_PROMPT_PRESETS.natural)
  assert.equal(resolveVideoPrompt(undefined), VIDEO_PROMPT_PRESETS.natural)
  assert.equal(resolveVideoPrompt(null), VIDEO_PROMPT_PRESETS.natural)
})

test("模式二和模式三都保留设计约定的 11 行预设文本", () => {
  const mode2Lines = VIDEO_PROMPT_PRESETS.mode2.split("\n")
  const mode3Lines = VIDEO_PROMPT_PRESETS.mode3.split("\n")

  assert.equal(mode2Lines.length, 11)
  assert.equal(mode2Lines[0], "他对着镜头说话，嘴部动作轻微，神情放松自然")
  assert.equal(mode2Lines[10], "他对着镜头说话，保持自然站姿，平稳完成表达")

  assert.equal(mode3Lines.length, 11)
  assert.equal(mode3Lines[0], "他对着镜头说话，表情自然，语气像在面对面交流")
  assert.equal(mode3Lines[10], "他对着镜头说话，整体神态从容，自然结束表达")
})

test("每种提示词模式都提供稳定的展示标签", () => {
  assert.deepEqual(VIDEO_PROMPT_MODE_LABELS, {
    natural: "自然模式",
    mode2: "模式二",
    mode3: "模式三",
  })
})
