type EnterpriseContextOptions = {
  maxChars: number
  includeContact: boolean
}

type EnterpriseSection = {
  heading: string
  body: string
}

const SECTION_ALIASES: Record<string, string> = {
  概览: "Overview",
  品牌实体: "企业档案",
  公司简介: "品牌与业务定位",
  品牌定位: "品牌与业务定位",
  产品要点: "产品与服务",
  服务项目: "产品与服务",
  目标客户: "客户与适用场景",
  适用场景: "客户与适用场景",
  团队优势: "核心优势与证据",
  核心优势: "核心优势与证据",
  服务流程: "服务流程与交付",
  收费标准: "价格与合作方式",
  客户评价: "客户案例与评价",
  客户案例: "客户案例与评价",
  常见问题: "FAQ",
  联系我们: "官方联系方式",
  "GEO 关键词": "GEO 检索词与问法",
  "GEO关键词": "GEO 检索词与问法",
  资料来源: "资料来源与待补充项",
}

const ARTICLE_PRIORITY = [
  "Overview",
  "企业档案",
  "品牌与业务定位",
  "产品与服务",
  "客户与适用场景",
  "核心优势与证据",
  "FAQ",
  "官方联系方式",
  "内容创作引用规则",
  "禁用与边界",
  "资料来源与待补充项",
]

const MATRIX_PRIORITY = [
  "Overview",
  "企业档案",
  "品牌与业务定位",
  "产品与服务",
  "客户与适用场景",
  "核心优势与证据",
  "FAQ",
  "GEO 检索词与问法",
  "内容创作引用规则",
  "禁用与边界",
  "资料来源与待补充项",
]

function parseSections(content: string): EnterpriseSection[] {
  const withoutFrontmatter = content
    .trim()
    .replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*/, "")
  const matches = [...withoutFrontmatter.matchAll(/^##\s+(.+?)\s*$/gm)]
  return matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? withoutFrontmatter.length
    const rawHeading = match[1].trim()
    return {
      heading: SECTION_ALIASES[rawHeading] ?? rawHeading,
      body: withoutFrontmatter.slice(start, end).trim(),
    }
  })
}

/**
 * Selects representative sections from a potentially long enterprise Skill.
 * Each selected section receives a share of the budget so important tail
 * sections cannot be displaced by a verbose opening section.
 */
export function buildEnterpriseContext(
  content: string,
  options: EnterpriseContextOptions,
): string {
  const maxChars = Math.max(0, Math.floor(options.maxChars))
  if (maxChars === 0) return ""
  const raw = content.trim()
  if (!raw) return ""

  const parsed = parseSections(raw)
  if (parsed.length === 0) return raw.slice(0, maxChars)

  const byHeading = new Map<string, EnterpriseSection>()
  for (const section of parsed) {
    if (!byHeading.has(section.heading)) byHeading.set(section.heading, section)
  }

  const priority = options.includeContact ? ARTICLE_PRIORITY : MATRIX_PRIORITY
  const selected = priority
    .map((heading) => byHeading.get(heading))
    .filter((section): section is EnterpriseSection => Boolean(section))

  if (selected.length === 0) return raw.slice(0, maxChars)

  const separatorsLength = Math.max(0, selected.length - 1) * 2
  const headingsLength = selected.reduce(
    (total, section) => total + `## ${section.heading}\n\n`.length,
    0,
  )
  const bodyBudget = Math.max(0, maxChars - separatorsLength - headingsLength)
  const perSection = Math.max(1, Math.floor(bodyBudget / selected.length))
  const blocks = selected.map((section) => {
    const body = section.body.length > perSection
      ? `${section.body.slice(0, Math.max(1, perSection - 1)).trimEnd()}…`
      : section.body
    return `## ${section.heading}\n\n${body}`
  })
  return blocks.join("\n\n").slice(0, maxChars)
}
