import assert from "node:assert/strict"
import test from "node:test"

import {
  alignJobSnapshots,
  ARTICLE_BATCH_COPIES_PER_SLOT_MAX,
  buildRetryJob,
  clampCopiesPerSlot,
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

test("矩阵模式 2 日期 × 2 平台 → 有效格子 jobs + skipped", () => {
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

test("方向模式超过 20 平台不再抛错", () => {
  const platforms = Array.from({ length: 21 }, (_, i) => `p${i}`)
  const { jobs } = expandDirectionJobs({
    mode: "direction",
    direction: "测试",
    platformIds: platforms,
  })
  assert.equal(jobs.length, 21)
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

test("clampCopiesPerSlot 限制在 1–MAX", () => {
  assert.equal(clampCopiesPerSlot(undefined), 1)
  assert.equal(clampCopiesPerSlot(0), 1)
  assert.equal(clampCopiesPerSlot(3), 3)
  assert.equal(clampCopiesPerSlot(99), ARTICLE_BATCH_COPIES_PER_SLOT_MAX)
  assert.equal(ARTICLE_BATCH_COPIES_PER_SLOT_MAX, 10)
})

test("方向模式 copiesPerSlot=3 → 平台数 × 3", () => {
  const { jobs } = expandDirectionJobs({
    mode: "direction",
    direction: "测试方向",
    platformIds: ["zhihu", "xiaohongshu"],
    copiesPerSlot: 3,
  })
  assert.equal(jobs.length, 6)
  const zhihu = jobs.filter((j) => j.platformId === "zhihu")
  assert.equal(zhihu.length, 3)
  assert.ok(zhihu[0].title.includes("第 1/3 篇"))
  assert.ok(zhihu[2].title.includes("第 3/3 篇"))
  assert.ok(zhihu[0].brief.includes("不同角度"))
})

test("矩阵模式 copiesPerSlot=3 → 同日同渠道 3 jobs", () => {
  const { jobs, skipped } = expandMatrixJobs({
    mode: "matrix",
    project: SAMPLE_PROJECT,
    dates: ["2026-07-01"],
    platformIds: ["zhihu"],
    copiesPerSlot: 3,
  })
  assert.equal(jobs.length, 3)
  assert.equal(skipped.length, 0)
  assert.ok(jobs.every((j) => j.date === "2026-07-01" && j.platformId === "zhihu"))
  assert.ok(jobs[0].title.includes("知乎标题A（第 1/3 篇）"))
  assert.ok(jobs[1].title.includes("第 2/3 篇"))
  assert.ok(jobs[2].brief.includes("不同角度"))
  const ids = new Set(jobs.map((j) => j.jobId))
  assert.equal(ids.size, 3)
})

test("alignJobSnapshots 按序对齐服务端 jobId", () => {
  const local = expandDirectionJobs({
    mode: "direction",
    direction: "测试方向",
    platformIds: ["zhihu", "xiaohongshu"],
  }).jobs
  const server = [
    { jobId: "srv-1", platformId: "zhihu" },
    { jobId: "srv-2", platformId: "xiaohongshu" },
  ]
  const snapshots = alignJobSnapshots(local, server)
  assert.equal(snapshots["srv-1"]?.brief, "测试方向")
  assert.equal(snapshots["srv-2"]?.platformId, "xiaohongshu")
})

test("buildRetryJob 可从矩阵格重建任务", () => {
  const job = buildRetryJob({
    jobId: "retry-1",
    mode: "matrix",
    platformId: "zhihu",
    date: "2026-07-01",
    title: "知乎标题A",
    project: SAMPLE_PROJECT,
  })
  assert.equal(job.brief, "方向A")
  assert.equal(job.matrixMeta?.format, "长文")
})
