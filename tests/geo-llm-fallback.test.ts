import assert from "node:assert/strict"
import test from "node:test"

import { completionAttemptSequence } from "../lib/geo/llm/router.ts"

test("completionAttemptSequence retries primary once then deepseek", () => {
  assert.deepEqual(completionAttemptSequence("gpt", true), ["gpt", "gpt", "deepseek"])
  assert.deepEqual(completionAttemptSequence("claude", true), [
    "claude",
    "claude",
    "deepseek",
  ])
  assert.deepEqual(completionAttemptSequence("doubao", true), [
    "doubao",
    "doubao",
    "deepseek",
  ])
})

test("completionAttemptSequence for deepseek only retries twice", () => {
  assert.deepEqual(completionAttemptSequence("deepseek", true), ["deepseek", "deepseek"])
})

test("completionAttemptSequence skips deepseek when fallback disabled", () => {
  assert.deepEqual(completionAttemptSequence("gpt", false), ["gpt", "gpt"])
})
