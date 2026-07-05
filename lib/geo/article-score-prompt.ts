import fs from "node:fs"
import path from "node:path"

import { buildSkillContextBlock } from "@/lib/geo/build-skill-context"
import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"
import { skillSummary } from "@/lib/geo/skill-summary"

const SKILL_ROOT = path.join(process.cwd(), "skills/geo")
const DEEP_ARTICLE_SKILL = "creation-guidelines/deep-article-optimization/SKILL.md"

function readSkillExcerpt(relPath: string, maxChars = 3500): string {
  try {
    const full = path.join(SKILL_ROOT, relPath)
    return fs.readFileSync(full, "utf-8").slice(0, maxChars)
  } catch {
    return ""
  }
}

export type ArticleScorePromptContext = {
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  platformId?: string | null
}

export function buildArticleScoreSystemPrompt(): string {
  const skillBody = readSkillExcerpt(DEEP_ARTICLE_SKILL, 3500)

  return `你是 GEO（Generative Engine Optimization）文章质量评估专家。
请依据「深度优化文章创作准则」的四维标准，对给定 Markdown 长文打分（0–100 整数）。

## 四维评分标准

1. **semanticClarity（语义清晰度）**：概念是否先定义；H2/H3 是否对齐检索意图；同义词与边界是否清晰
2. **conversationalTone（对话语气）**：是否用用户会问的自然语言；是否有问答节奏而非术语堆砌
3. **evidenceDensity（证据密度）**：关键结论是否有可验证数据/来源；是否区分事实与观点
4. **structuredFaq（结构化 FAQ）**：文末是否有清晰 FAQ；回答是否简明可引用

## 参考准则摘录

${skillBody}

## 输出格式（严格 JSON，不要 markdown 代码块外的任何文字）

{
  "semanticClarity": 0-100,
  "conversationalTone": 0-100,
  "evidenceDensity": 0-100,
  "structuredFaq": 0-100,
  "summary": "一句话总评（50字以内）"
}`
}

export function buildArticleScoreUserPrompt(
  markdown: string,
  ctx: ArticleScorePromptContext,
): string {
  const parts: string[] = []

  const skillBlock = buildSkillContextBlock({
    modelSkillId: ctx.modelSkillId,
    enterpriseSnapshot: ctx.enterpriseSnapshot,
  })
  if (skillBlock) {
    parts.push(skillBlock)
  }

  const viralIds = ctx.viralSkillIds ?? []
  if (viralIds.length > 0) {
    const viralBlocks = viralIds
      .map((id) => skillSummary(id))
      .filter(Boolean)
      .join("\n\n")
    if (viralBlocks) {
      parts.push(`## B 层平台爆款逻辑\n${viralBlocks}`)
    }
  }

  if (ctx.platformId) {
    parts.push(`目标发布平台：${getMatrixPlatformLabel(ctx.platformId)}`)
  }

  parts.push(
    "## 待评分文章（Markdown）",
    markdown.slice(0, 12000),
    "",
    "请按系统提示输出 JSON 评分。",
  )

  return parts.join("\n\n")
}
