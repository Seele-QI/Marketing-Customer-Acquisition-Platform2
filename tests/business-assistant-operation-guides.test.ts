import assert from "node:assert/strict"
import test from "node:test"

import {
  listOperationGuides,
  resolveOperationGuide,
} from "@/lib/business-assistant/operation-guides"
import { GEO_VIEWS } from "@/lib/geo/workspace"
import { VIDEO_VIEWS } from "@/lib/video/workspace"

test("every video and GEO view has a useful deterministic operation guide", () => {
  const expected = [
    ...Object.values(VIDEO_VIEWS).map((view) => [view, "video-creation"] as const),
    ...Object.values(GEO_VIEWS).map((view) => [view, "geo-growth"] as const),
  ]

  assert.equal(listOperationGuides().length, expected.length)
  for (const [view, assistantId] of expected) {
    const guide = resolveOperationGuide(view)
    assert.ok(guide, `${view} should resolve a guide`)
    assert.equal(guide.assistantId, assistantId)
    assert.ok(guide.purpose.length >= 10)
    assert.ok(guide.preparation.length > 0)
    assert.ok(guide.steps.length > 0)
    assert.ok(guide.steps.every((step) => step.completionCriteria.length > 0))
    assert.ok(
      guide.steps.some((step) => Boolean(step.highlightTarget)),
      `${view} needs a real highlight target`,
    )
  }
})

test("unsupported pages never invent a dedicated assistant guide", () => {
  for (const view of ["工作台", "身份定位", "海报图创作", "抖音截流"]) {
    assert.equal(resolveOperationGuide(view), undefined)
  }
})
