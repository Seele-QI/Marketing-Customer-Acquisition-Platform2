import assert from "node:assert/strict"
import test from "node:test"

import {
  parseMatrixJson,
  stripJsonFences,
  validateMatrixPlatforms,
  assertMatrixFourteenDays,
  alignPlatformCellsToFourteenDays,
  mergePlatformMatrices,
  parseThemeArcSeed,
} from "../lib/geo/matrix-json.ts"
import {
  MATRIX_DAYS,
  matrixDateRange,
  matrixStartDateIso,
  resolveViralSkillIds,
} from "../lib/geo/matrix-platforms.ts"

const SAMPLE_JSON = `{
  "platforms": [
    {
      "platformId": "zhihu",
      "cells": [
        {
          "date": "2026-07-07",
          "week": 1,
          "themeArc": "AI 视频翻译认知",
          "title": "什么是 AI 视频翻译",
          "contentDirection": "定义概念与适用场景",
          "format": "长文",
          "geoIntent": "教程",
          "platformNative": "专栏 SEO 标题 + 论证结构"
        }
      ]
    }
  ]
}`

test("stripJsonFences 去除 markdown 代码块", () => {
  const wrapped = "```json\n" + SAMPLE_JSON + "\n```"
  assert.equal(stripJsonFences(wrapped), SAMPLE_JSON)
})

test("parseMatrixJson 解析合法 platforms 结构", () => {
  const data = parseMatrixJson(SAMPLE_JSON)
  assert.equal(data.platforms.length, 1)
  assert.equal(data.platforms[0].platformId, "zhihu")
  assert.equal(data.platforms[0].cells[0].title, "什么是 AI 视频翻译")
})

test("parseMatrixJson 缺少 platforms 时抛错", () => {
  assert.throws(() => parseMatrixJson('{"foo":1}'), /platforms/)
})

test("validateMatrixPlatforms 过滤未选平台并写入 skillId", () => {
  const data = parseMatrixJson(SAMPLE_JSON)
  const out = validateMatrixPlatforms(data, ["zhihu", "xiaohongshu"])
  assert.equal(out.platforms.length, 1)
  assert.equal(out.skillId, "content-matrix-planning")
  assert.ok(out.generatedAt)
})

test("validateMatrixPlatforms 剔除未选中的平台", () => {
  const multi = parseMatrixJson(`{
    "platforms": [
      { "platformId": "zhihu", "cells": [] },
      { "platformId": "weibo", "cells": [] }
    ]
  }`)
  const out = validateMatrixPlatforms(multi, ["zhihu"])
  assert.equal(out.platforms.length, 1)
  assert.equal(out.platforms[0].platformId, "zhihu")
})

test("resolveViralSkillIds union 平台默认与用户勾选", () => {
  const ids = resolveViralSkillIds(["weibo", "ctrip"], ["viral-tieba"])
  assert.ok(ids.includes("viral-weibo"))
  assert.ok(ids.includes("viral-ctrip"))
  assert.ok(ids.includes("viral-tieba"))
})

test("八平台均有 viralSkillId", () => {
  const all = resolveViralSkillIds([
    "xiaohongshu",
    "douyin",
    "weibo",
    "dianping",
    "zhihu",
    "ctrip",
    "netease",
    "sohu",
  ])
  assert.equal(all.length, 8)
})

test("matrixDateRange 返回恰好 14 天", () => {
  const dates = matrixDateRange("2026-07-06", MATRIX_DAYS)
  assert.equal(dates.length, 14)
  assert.equal(dates[0], "2026-07-06")
  assert.equal(dates[13], "2026-07-19")
})

test("matrixStartDateIso 为当天本地日期而非周一", () => {
  // 2026-07-04 为周六，旧逻辑会回退到 2026-06-29（周一）
  const sat = new Date(2026, 6, 4, 12, 0, 0)
  assert.equal(matrixStartDateIso(sat), "2026-07-04")
  const mon = new Date(2026, 5, 29, 12, 0, 0)
  assert.equal(matrixStartDateIso(mon), "2026-06-29")
})

test("alignPlatformCellsToFourteenDays 补齐到 14 格", () => {
  const pm = alignPlatformCellsToFourteenDays(
    "zhihu",
    [
      {
        date: "2026-07-06",
        week: 1,
        themeArc: "弧A",
        title: "标题",
        contentDirection: "方向",
        format: "长文",
        geoIntent: "教程",
        platformNative: "SEO",
      },
    ],
    "2026-07-06",
    "弧A",
  )
  assert.equal(pm.cells.length, 14)
  assert.equal(pm.cells[0].title, "标题")
  assert.equal(pm.cells[1].date, "2026-07-07")
  assert.equal(pm.cells[7].week, 2)
})

test("assertMatrixFourteenDays 不足 14 且不 fill 时抛错", () => {
  const data = parseMatrixJson(SAMPLE_JSON)
  assert.throws(
    () => assertMatrixFourteenDays(data, ["zhihu"], "2026-07-07"),
    /14/,
  )
})

test("assertMatrixFourteenDays fillMissing 对齐 14 格", () => {
  const data = parseMatrixJson(SAMPLE_JSON)
  const out = assertMatrixFourteenDays(data, ["zhihu"], "2026-07-07", {
    fillMissing: true,
  })
  assert.equal(out.platforms[0].cells.length, 14)
})

test("mergePlatformMatrices 按 expected 顺序合并", () => {
  const merged = mergePlatformMatrices(
    [
      { platformId: "weibo", cells: [] },
      { platformId: "zhihu", cells: [] },
    ],
    ["zhihu", "weibo"],
  )
  assert.deepEqual(
    merged.platforms.map((p) => p.platformId),
    ["zhihu", "weibo"],
  )
})

test("parseThemeArcSeed 校验 14 天", () => {
  const dates = matrixDateRange("2026-07-06", 14)
  const seed = {
    themeArcs: ["弧1"],
    days: dates.map((date, i) => ({
      date,
      week: (i < 7 ? 1 : 2) as 1 | 2,
      themeArc: "弧1",
      dayTheme: `D${i + 1}`,
    })),
  }
  const parsed = parseThemeArcSeed(JSON.stringify(seed))
  assert.equal(parsed.days.length, 14)
})
