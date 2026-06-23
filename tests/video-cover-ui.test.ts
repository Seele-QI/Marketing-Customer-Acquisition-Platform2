import assert from "node:assert/strict"
import test from "node:test"

import { getCoverUiState } from "../lib/video-cover-ui.ts"

test("封面空闲时返回 idle 状态", () => {
  const state = getCoverUiState({
    coverUrl: "",
    coverStatus: "idle",
    coverError: "",
    videoStatus: "success",
  })

  assert.equal(state.kind, "idle")
  assert.equal(state.message, "封面图尚未生成")
  assert.equal(state.allowRetry, false)
})

test("封面生成中时返回 running 状态", () => {
  const state = getCoverUiState({
    coverUrl: "",
    coverStatus: "running",
    coverError: "",
    videoStatus: "success",
  })

  assert.equal(state.kind, "running")
  assert.match(state.message, /封面图自动生成中/)
  assert.equal(state.allowRetry, false)
})

test("封面成功时返回 success 状态", () => {
  const state = getCoverUiState({
    coverUrl: "https://example.com/cover.png",
    coverStatus: "success",
    coverError: "",
    videoStatus: "success",
  })

  assert.equal(state.kind, "success")
  assert.equal(state.message, "竖屏 3:4 封面图，可下载使用")
  assert.equal(state.allowRetry, false)
})

test("封面失败时返回 failed 状态并显示重试文案", () => {
  const state = getCoverUiState({
    coverUrl: "",
    coverStatus: "failed",
    coverError: "封面生成失败",
    videoStatus: "success",
  })

  assert.equal(state.kind, "failed")
  assert.match(state.message, /封面生成失败/)
  assert.equal(state.allowRetry, true)
})
