import fs from "node:fs"
import path from "node:path"

import {
  MATRIX_DAYS,
  MATRIX_PLATFORMS,
  getMatrixPlatformLabel,
  matrixStartDateIso,
  resolveViralSkillIds,
} from "@/lib/geo/matrix-platforms"
import { skillSummary } from "@/lib/geo/skill-summary"
import type { ThemeArcSeed } from "@/lib/geo/matrix-json"

export type { ThemeArcSeed } from "@/lib/geo/matrix-json"

export {
  buildMatrixRepairPrompt,
  parseMatrixJson,
  stripJsonFences,
  validateMatrixPlatforms,
  assertMatrixFourteenDays,
  alignPlatformCellsToFourteenDays,
  mergePlatformMatrices,
  parseThemeArcSeed,
} from "@/lib/geo/matrix-json"

const SKILL_ROOT = path.join(process.cwd(), "skills/geo")
const MATRIX_SKILL_PATH = "creation-guidelines/content-matrix-planning/SKILL.md"

function readSkillExcerpt(relPath: string, maxChars = 4000): string {
  try {
    const full = path.join(SKILL_ROOT, relPath)
    const raw = fs.readFileSync(full, "utf-8")
    return raw.slice(0, maxChars)
  } catch {
    return ""
  }
}

export type BuildMatrixPromptInput = {
  projectName: string
  platforms: string[]
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  startIso?: string
}

function enterpriseBlock(snapshot?: string | null): string {
  const ent = (snapshot ?? "").trim()
  return ent ? `## 企业知识库（C 层）\n${ent.slice(0, 6000)}` : ""
}

function modelBlock(modelSkillId?: string | null): string {
  return skillSummary(modelSkillId) || "（未指定，使用通用 GEO 策略）"
}

function viralBlockForIds(ids: string[]): string {
  const text = ids.map((id) => skillSummary(id)).filter(Boolean).join("\n\n")
  return text || "（未指定，仅使用平台 playbook）"
}

export function buildMatrixSystemPrompt(): string {
  const skillBody = readSkillExcerpt(MATRIX_SKILL_PATH, 5000)
  const playbooks = readSkillExcerpt(
    "creation-guidelines/content-matrix-planning/platform-playbooks.md",
    3000,
  )
  const coherence = readSkillExcerpt(
    "creation-guidelines/content-matrix-planning/cross-platform-coherence.md",
    2000,
  )

  return `你是 GEO（Generative Engine Optimization）内容矩阵规划专家。
你必须严格遵守「内容矩阵规划准则」并只输出合法 JSON（不要 Markdown 代码块、不要解释文字）。

## 硬规则
1. 跨平台主题关联：${MATRIX_DAYS} 天内 1–2 条 themeArc 贯穿演进
2. 平台原生改写：同主题各平台 format/title/platformNative 必须不同
3. 证据与体验分离：不伪造数据
4. 每平台恰好 ${MATRIX_DAYS} 个内容位（一日一格，date 从当天起连续 ${MATRIX_DAYS} 天 ISO 格式；week：D1–D7=1，D8–D14=2）

## 准则摘要
${skillBody}

## 平台玩法
${playbooks}

## 跨平台一致性
${coherence}

## 输出 JSON Schema（严格遵守）
{
  "platforms": [
    {
      "platformId": "xiaohongshu",
      "cells": [
        {
          "date": "2026-07-07",
          "week": 1,
          "themeArc": "主题弧名称",
          "title": "平台原生标题",
          "contentDirection": "创作方向详细说明",
          "format": "图文",
          "geoIntent": "种草",
          "platformNative": "平台特有要点"
        }
      ]
    }
  ]
}`
}

/** Phase A：共享 themeArc 种子（轻量） */
export function buildThemeArcSeedSystemPrompt(): string {
  return `你是 GEO 内容矩阵规划专家。只输出合法 JSON（不要 Markdown、不要解释）。
为两周（恰好 ${MATRIX_DAYS} 天）规划 1–2 条 themeArc，并为每一天给出一句 dayTheme。`
}

export function buildThemeArcSeedUserPrompt(input: BuildMatrixPromptInput): string {
  const startIso = input.startIso ?? matrixStartDateIso()
  const platformLabels = input.platforms
    .map((id) => {
      const def = MATRIX_PLATFORMS.find((p) => p.id === id)
      return def ? `${id}（${def.label}）` : id
    })
    .join("、")

  return `项目「${input.projectName}」需要两周 themeArc 种子。

## 选中平台
${platformLabels}

## 起始日期（当天）
${startIso}（days 数组必须恰好 ${MATRIX_DAYS} 项，date 从该日起连续）

## A 层模型权重
${modelBlock(input.modelSkillId)}

${enterpriseBlock(input.enterpriseSnapshot)}

输出 JSON：
{
  "themeArcs": ["弧名1", "弧名2"],
  "days": [
    { "date": "${startIso}", "week": 1, "themeArc": "弧名1", "dayTheme": "当日主题一句话" }
  ]
}
days 必须含 ${MATRIX_DAYS} 项；week：前 7 天为 1，后 7 天为 2；themeArc 必须来自 themeArcs。`
}

/** Phase B：单平台恰好 14 cells */
export function buildSinglePlatformSystemPrompt(): string {
  return `你是 GEO 内容矩阵规划专家。只输出合法 JSON（不要 Markdown、不要解释）。
为**单个平台**生成恰好 ${MATRIX_DAYS} 个内容位（一日一格），必须使用给定 themeArc 种子中的弧名与日期。`
}

export function buildSinglePlatformUserPrompt(
  input: BuildMatrixPromptInput & {
    platformId: string
    themeSeed: ThemeArcSeed
  },
): string {
  const startIso = input.startIso ?? matrixStartDateIso()
  const label = getMatrixPlatformLabel(input.platformId)
  const viralIds = resolveViralSkillIds([input.platformId], input.viralSkillIds)
  const seedJson = JSON.stringify(input.themeSeed, null, 0)

  return `请为项目「${input.projectName}」的平台 **${input.platformId}（${label}）** 生成两周 GEO 内容矩阵。

## 起始日期（当天）
${startIso}

## themeArc 种子（必须遵守日期与 themeArc 名称）
${seedJson}

## A 层模型权重
${modelBlock(input.modelSkillId)}

## B 层平台爆款（本平台）
${viralBlockForIds(viralIds)}

${enterpriseBlock(input.enterpriseSnapshot)}

## 硬性要求
1. 只输出该平台，platformId 必须是 "${input.platformId}"
2. cells 恰好 ${MATRIX_DAYS} 项，date 与种子 days 完全一致
3. 每格 week / themeArc 与种子对应日一致
4. title / contentDirection / format / geoIntent / platformNative 必须体现该平台原生差异

输出 JSON：
{
  "platforms": [
    {
      "platformId": "${input.platformId}",
      "cells": [ /* 恰好 ${MATRIX_DAYS} 项 */ ]
    }
  ]
}`
}

/** 单平台补全缺失日期 */
export function buildPlatformFillUserPrompt(input: {
  platformId: string
  startIso: string
  missingDates: string[]
  existingCellsJson: string
  themeSeed: ThemeArcSeed
  projectName: string
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
}): string {
  const label = getMatrixPlatformLabel(input.platformId)
  const viralIds = resolveViralSkillIds([input.platformId], input.viralSkillIds)
  return `平台 ${input.platformId}（${label}）矩阵不完整，请只补全缺失日期的 cells。

## 缺失日期
${input.missingDates.join(", ")}

## 已有 cells（勿重复这些 date）
${input.existingCellsJson.slice(0, 8000)}

## themeArc 种子
${JSON.stringify(input.themeSeed)}

## B 层
${viralBlockForIds(viralIds)}

## A 层
${modelBlock(input.modelSkillId)}

${enterpriseBlock(input.enterpriseSnapshot)}

输出 JSON：{ "platforms": [ { "platformId": "${input.platformId}", "cells": [ /* 仅缺失日期，共 ${input.missingDates.length} 项 */ ] } ] }`
}

/** 兼容旧单次全量 prompt（测试/回退） */
export function buildMatrixUserPrompt(input: BuildMatrixPromptInput): string {
  const startIso = input.startIso ?? matrixStartDateIso()
  const platformLabels = input.platforms
    .map((id) => {
      const def = MATRIX_PLATFORMS.find((p) => p.id === id)
      return def ? `${id}（${def.label}）` : id
    })
    .join("、")

  const viralIds = resolveViralSkillIds(input.platforms, input.viralSkillIds)

  return `请为项目「${input.projectName}」生成两周 GEO 内容矩阵。

## 选中平台
${platformLabels}

## 起始日期（当天）
${startIso}（cells 的 date 从该日起连续 ${MATRIX_DAYS} 天）

## A 层模型权重
${modelBlock(input.modelSkillId)}

## B 层平台爆款
${viralBlockForIds(viralIds)}

${enterpriseBlock(input.enterpriseSnapshot)}

请为每个选中平台各输出恰好 ${MATRIX_DAYS} 个 cells（一日一格），确保 themeArc 跨平台关联且平台原生差异化。`
}
