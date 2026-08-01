import assert from "node:assert/strict"
import test from "node:test"

import {
  DISTRIBUTION_VIEWS,
  getDistributionBreadcrumb,
  isDistributionView,
} from "../lib/distribution/workspace.ts"

test("一键分发只识别两个稳定子视图", () => {
  assert.equal(isDistributionView(DISTRIBUTION_VIEWS.VIDEO), true)
  assert.equal(isDistributionView(DISTRIBUTION_VIEWS.GEO_ARTICLE), true)
  assert.equal(isDistributionView("账号绑定"), false)
  assert.equal(isDistributionView("工作台"), false)
})

test("一键分发面包屑使用统一父级", () => {
  assert.deepEqual(getDistributionBreadcrumb(DISTRIBUTION_VIEWS.VIDEO), {
    parent: "一键分发",
    current: "视频一键分发",
  })
  assert.deepEqual(getDistributionBreadcrumb(DISTRIBUTION_VIEWS.GEO_ARTICLE), {
    parent: "一键分发",
    current: "GEO文章一键分发",
  })
})

