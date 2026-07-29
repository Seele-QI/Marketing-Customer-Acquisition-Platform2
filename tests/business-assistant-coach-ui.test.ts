import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const contextSource = readFileSync(
  new URL("../lib/business-assistant/context.tsx", import.meta.url),
  "utf8",
)
const shellSource = readFileSync(
  new URL("../components/business-assistant-shell.tsx", import.meta.url),
  "utf8",
)
const spotlightSource = (() => {
  try {
    return readFileSync(
      new URL("../components/business-assistant-spotlight.tsx", import.meta.url),
      "utf8",
    )
  } catch {
    return ""
  }
})()

test("the floating assistant opens as a projectless current-page guide", () => {
  assert.match(contextSource, /resolveOperationGuide/)
  assert.doesNotMatch(contextSource, /void refreshProjects\(\)/)
  assert.match(shellSource, /操作指南/)
  assert.match(shellSource, /问助理/)
  assert.match(shellSource, /我的进度/)
  assert.match(shellSource, /定位到当前操作/)
})

test("project API failures are handled inside the provider", () => {
  assert.match(contextSource, /projectError/)
  assert.match(contextSource, /catch \(caught\)/)
})

test("the coach can scroll to and non-blockingly highlight a real control", () => {
  assert.match(spotlightSource, /scrollIntoView/)
  assert.match(spotlightSource, /data-tutorial-id/)
  assert.match(spotlightSource, /pointer-events-none/)
})
