import assert from "node:assert/strict"
import test from "node:test"

import {
  ARTICLE_BATCH_MAX_JOBS,
  expandDirectionJobs,
  expandMatrixJobs,
} from "../lib/geo/article-batch-jobs.ts"
import type { MatrixProject } from "../lib/geo/matrix-types.ts"

const SAMPLE_PROJECT: MatrixProject = {
  id: "p1",
  userId: 1,
  name: "测试项目",
  platforms: ["zhihu", "xiaohongshu"],
  modelSkillId: null,
  viralSkillIds: [],
  enterpriseSkillId: null,
  enterpriseSnapshot: null,
  provider: "deepseek",
  createdAt: 1,
  updatedAt: 1,
  matrix: {
    platforms: [
      {
        platformId: "zhihu",
        cells: [
          {
            date: "2026-07-01",
            week: 1,
            themeArc: "弧1",
            title: "知乎标题A",
            contentDirection: "方向A",
            format: "长文",
            geoIntent: "教程",
            platformNative: "论证",
          },
          {
            date: "2026-07-02",
            week: 1,
            themeArc: "弧1",
            title: "知乎标题B",
            contentDirection: "方向B",
            format: "长文",
            geoIntent: "教程",
            platformNative: "论证",
          },
        ],
      },
      {
        platformId: "xiaohongshu",
        cells: [
          {
            date: "2026-07-01",
            week: 1,
            themeArc: "弧1",
            title: "小红书标题A",
            contentDirection: "方向A",
            format: "笔记",
            geoIntent: "种草",
            platformNative: "emoji",
          },
        ],
      },
    ],
  },
}

test("方向模式 3 平台 → 3 jobs", () => {
  const { jobs } = expandDirectionJobs({
    mode: "direction",
    direction: "AI 视频翻译指南",
    platformIds: ["zhihu", "xiaohongshu", "douyin"],
  })
  assert.equal(jobs.length, 3)
  assert.equal(jobs[0].mode, "direction")
  assert.ok(jobs[0].title.includes("AI 视频翻译指南"))
})

test("矩阵模式 2 日期 × 2 平台 → 4 jobs", () => {
  const { jobs, skipped } = expandMatrixJobs({
    mode: "matrix",
    project: SAMPLE_PROJECT,
    dates: ["2026-07-01", "2026-07-02"],
    platformIds: ["zhihu", "xiaohongshu"],
  })
  assert.equal(jobs.length, 3)
  assert.equal(skipped.length, 1)
  assert.ok(skipped.some((s) => s.date === "2026-07-02" && s.platformId === "xiaohongshu"))
})

test("超过 20 jobs 抛错", () => {
  const platforms = Array.from({ length: 21 }, (_, i) => `p${i}`)
  assert.throws(
    () =>
      expandDirectionJobs({
        mode: "direction",
        direction: "测试",
        platformIds: platforms,
      }),
    /单次最多生成 20 篇/,
  )
})

test("缺 cell 的 date+platform 计入 skipped", () => {
  const { jobs, skipped } = expandMatrixJobs({
    mode: "matrix",
    project: SAMPLE_PROJECT,
    dates: ["2026-07-02"],
    platformIds: ["zhihu", "xiaohongshu"],
  })
  assert.equal(jobs.length, 1)
  assert.equal(skipped.length, 1)
  assert.equal(skipped[0].platformId, "xiaohongshu")
})

test("ARTICLE_BATCH_MAX_JOBS 为 20", () => {
  assert.equal(ARTICLE_BATCH_MAX_JOBS, 20)
})
