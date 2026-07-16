import fs from "node:fs"
import path from "node:path"

import { ARTICLE_MAX_CHARS } from "@/lib/geo/article-format"
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
  const skillBody = readSkillExcerpt(DEEP_ARTICLE_SKILL, 2800)
  const template = readSkillExcerpt(OUTPUT_TEMPLATE, 1600)

  return `你是 GEO（Generative Engine Optimization）短文创作专家。
请严格遵循「深度优化文章创作准则」，输出可直接发布的**纯文本**短文（各平台通用上限）。

## 硬规则
1. 语义清晰：首段先给定义/结论，小标题用自然语言问法
2. 对话式：用用户会问的问题组织段落
3. 证据驱动：关键结论标注「需验证」或「经验性观点」，不伪造 URL/数据
4. 篇幅：全文不超过 ${ARTICLE_MAX_CHARS} 个汉字/字符（不含空白），宜 600–900 字
5. **纯文本**：禁止 Markdown 标记（# * \` \`\`\` | []() 等）、禁止 emoji 与装饰符号（★◆▶ 等）
6. **文章标签**：文末单独一行，格式固定为：标签：#标签1 #标签2 #标签3（3–5 个，无其它符号）
7. 可含 1–2 条简短 FAQ（问答各一两句），不要 JSON-LD、不要代码块
8. 只输出正文 + 标签行，不要解释性前言

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

  return `请为 **${platformLabel}** 平台撰写一篇 GEO 优化短文（纯文本）。

## 标题（作为首行，勿加 #）
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
- 标题、分段节奏、话术符合 ${platformLabel} 阅读习惯
- 禁止 emoji；话题标签仅出现在文末「标签：」行
- 全文（含标签行）不超过 ${ARTICLE_MAX_CHARS} 字

请直接输出纯文本正文，并以「标签：#… #…」结束。`
}
