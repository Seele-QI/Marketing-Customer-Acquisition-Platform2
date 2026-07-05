import fs from "node:fs"
import path from "node:path"

import { buildSkillContextBlock } from "@/lib/geo/build-skill-context"
import { getMatrixPlatformLabel, resolveViralSkillIds } from "@/lib/geo/matrix-platforms"
import { skillSummary } from "@/lib/geo/skill-summary"
import type { ArticleJob } from "@/lib/geo/article-types"

const SKILL_ROOT = path.join(process.cwd(), "skills/geo")
const DEEP_ARTICLE_SKILL = "creation-guidelines/deep-article-optimization/SKILL.md"
const OUTPUT_TEMPLATE = "creation-guidelines/deep-article-optimization/output-template.md"

function readSkillExcerpt(relPath: string, maxChars = 4000): string {
  try {
    const full = path.join(SKILL_ROOT, relPath)
    return fs.readFileSync(full, "utf-8").slice(0, maxChars)
  } catch {
    return ""
  }
}

export type ArticlePromptContext = {
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
}

export function buildArticleSystemPrompt(): string {
  const skillBody = readSkillExcerpt(DEEP_ARTICLE_SKILL, 3500)
  const template = readSkillExcerpt(OUTPUT_TEMPLATE, 2000)

  return `你是 GEO（Generative Engine Optimization）深度长文创作专家。
请严格遵循「深度优化文章创作准则」，输出可直接发布的 Markdown 长文。

## 硬规则
1. 语义清晰：概念先定义，H2/H3 对齐用户检索意图
2. 对话式：用用户会问的自然语言问题组织段落
3. 证据驱动：关键结论标注「需验证」或「经验性观点」，不伪造 URL/数据
4. 结构化 FAQ：文末至少 3 条 Q&A
5. 篇幅：1200–2500 汉字（不含 Markdown 符号）
6. 只输出 Markdown 正文，不要 JSON-LD，不要解释性前言

## 准则摘录
${skillBody}

## 输出结构参考
${template}`
}

function viralBlockForPlatform(
  platformId: string,
  viralSkillIds?: string[],
): string {
  const ids = resolveViralSkillIds([platformId], viralSkillIds)
  const text = ids.map((id) => skillSummary(id)).filter(Boolean).join("\n\n")
  return text || "（使用该平台通用内容结构）"
}

export function buildArticleUserPrompt(
  job: ArticleJob,
  ctx: ArticlePromptContext,
): string {
  const platformLabel = getMatrixPlatformLabel(job.platformId)
  const modelBlock = skillSummary(ctx.modelSkillId) || "（通用 GEO 策略）"
  const viralBlock = viralBlockForPlatform(job.platformId, ctx.viralSkillIds)
  const enterpriseBlock = buildSkillContextBlock({
    modelSkillId: null,
    enterpriseSnapshot: ctx.enterpriseSnapshot,
  })

  const matrixSection =
    job.mode === "matrix" && job.matrixMeta
      ? `
## 内容矩阵格（必须遵循）
- 主题弧：${job.matrixMeta.themeArc}
- 体裁：${job.matrixMeta.format}
- GEO 意图：${job.matrixMeta.geoIntent}
- 平台原生要点：${job.matrixMeta.platformNative}
- 计划发布日：${job.date ?? "待定"}`
      : ""

  return `请为 **${platformLabel}** 平台撰写一篇 GEO 优化长文。

## 标题（H1 使用）
${job.title}

## 创作方向
${job.brief}
${matrixSection}

## A 层大模型引用策略
${modelBlock}

## B 层平台爆款逻辑
${viralBlock}

${enterpriseBlock ? `${enterpriseBlock}\n` : ""}
## 平台原生要求
- 标题、段落节奏、话术必须符合 ${platformLabel} 用户阅读习惯
- 与通用长文不同：钩子、分段、emoji/标签（如适用）按 B 层策略调整

请直接输出完整 Markdown 长文。`
}
