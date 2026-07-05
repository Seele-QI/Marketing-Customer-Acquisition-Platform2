import type { AuthorityPage, GeoEntityData } from "@/lib/geo/entity-types"
import { HTMLTEXT_PROMPT_BUDGET } from "@/lib/tianapi-htmltext"

export type EnterpriseDocInput = {
  name: string
  text: string
}

const MAX_DOC_CHARS = 12_000
const MAX_TOTAL_DOC_CHARS = 24_000

function truncateDocs(docs: EnterpriseDocInput[]): string {
  let total = 0
  const parts: string[] = []
  for (const doc of docs) {
    const remaining = MAX_TOTAL_DOC_CHARS - total
    if (remaining <= 0) break
    const text =
      doc.text.length > MAX_DOC_CHARS
        ? `${doc.text.slice(0, MAX_DOC_CHARS)}\n…（已截断）`
        : doc.text
    const clipped = text.length > remaining ? `${text.slice(0, remaining)}\n…（已截断）` : text
    parts.push(`### 文档：${doc.name}\n${clipped}`)
    total += clipped.length
  }
  return parts.join("\n\n")
}

function formatEntity(entity: GeoEntityData): string {
  const links =
    entity.authorityLinks.filter((l) => l.trim()).join("\n") || "（无）"

  return `公司名称：${entity.companyName || "（未填）"}
行业：${entity.industry || "（未填）"}
核心产品：${entity.coreProduct || "（未填）"}
权威链接：
${links}`
}

/** 将权威链接抓取结果格式化为 prompt 区块（合计 ≤ HTMLTEXT_PROMPT_BUDGET） */
export function formatAuthorityPages(pages: AuthorityPage[]): string {
  if (pages.length === 0) return "（无已抓取正文）"

  let total = 0
  const parts: string[] = []

  for (const page of pages) {
    const remaining = HTMLTEXT_PROMPT_BUDGET - total
    if (remaining <= 0) break

    if (page.error && !page.content.trim()) {
      const block = `### ${page.url}\n抓取失败：${page.error}`
      if (block.length > remaining) break
      parts.push(block)
      total += block.length
      continue
    }

    const title = page.title.trim() || page.url
    const header = `### ${title}\n来源：${page.url}\n`
    const bodyBudget = remaining - header.length
    if (bodyBudget <= 0) break
    const body =
      page.content.length > bodyBudget
        ? `${page.content.slice(0, bodyBudget)}\n…（已截断）`
        : page.content
    const block = `${header}${body}`
    parts.push(block)
    total += block.length
  }

  return parts.join("\n\n") || "（无已抓取正文）"
}

export function buildEnterpriseSkillSystemPrompt(): string {
  return `你是 GEO（Generative Engine Optimization）企业知识库架构师。
任务：将用户提供的品牌实体、权威链接网页正文与资料文档，蒸馏为一份 Cursor Agent 可用的 SKILL.md 文件。

输出要求：
1. 仅输出完整 SKILL.md 正文（含 YAML frontmatter），不要包裹 markdown 代码块
2. frontmatter 必须包含 name（kebab-case）与 description（仅写触发条件，一句话）
3. 正文结构必须包含以下章节（用 ## 标题）：
   - Overview（品牌一句话定位）
   - 品牌实体（公司、行业、产品、权威来源）
   - 产品要点（3–6 条可验证卖点）
   - FAQ（至少 3 组问答，基于权威链接正文与上传资料提炼，不编造）
   - GEO 关键词（10–20 个检索词/长尾问法）
   - 禁用与边界（禁止洗稿、禁止伪造数据、禁止未证实声明）
4. 语言：简体中文为主，专有名词可保留英文
5. 所有事实必须来自输入资料与权威链接正文；缺失处标注「待补充」而非编造
6. description 字段遵循：「Use when …」句式，说明何时应加载此 Skill`
}

export function buildEnterpriseSkillUserPrompt(
  skillName: string,
  entity: GeoEntityData,
  documents: EnterpriseDocInput[],
  authorityPages: AuthorityPage[] = [],
): string {
  const docsBlock =
    documents.length > 0 ? truncateDocs(documents) : "（用户未上传文档，仅基于实体信息生成）"

  return `请为「${skillName}」生成企业知识库 SKILL.md。

## 实体信息
${formatEntity(entity)}

## 权威链接正文
${formatAuthorityPages(authorityPages)}

## 上传资料
${docsBlock}

请直接输出完整 SKILL.md 文本。`
}

/** 从生成的 SKILL.md 提取 description（frontmatter 或首段 fallback） */
export function extractSkillDescription(content: string): string {
  const fmMatch = /^---\s*\n[\s\S]*?description:\s*(.+?)\s*\n[\s\S]*?---/m.exec(content)
  if (fmMatch) {
    const raw = fmMatch[1].replace(/^["']|["']$/g, "").trim()
    if (raw) return raw.slice(0, 200)
  }
  const firstLine = content.replace(/^---[\s\S]*?---\s*/m, "").trim().split("\n")[0]
  return firstLine?.replace(/^#+\s*/, "").slice(0, 200) || "企业知识库 Skill"
}

/** 从 frontmatter 提取 name，fallback 为 slug */
export function extractSkillName(content: string, fallbackLabel: string): string {
  const fmMatch = /^---\s*\n[\s\S]*?name:\s*(.+?)\s*\n/m.exec(content)
  if (fmMatch) {
    return fmMatch[1].replace(/^["']|["']$/g, "").trim()
  }
  return fallbackLabel
    .toLowerCase()
    .replace(/[^\w\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "enterprise-kb"
}
