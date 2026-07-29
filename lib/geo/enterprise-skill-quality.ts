export const ENTERPRISE_SKILL_REQUIRED_SECTIONS = [
  "Overview",
  "企业档案",
  "品牌与业务定位",
  "产品与服务",
  "客户与适用场景",
  "核心优势与证据",
  "团队与资质",
  "服务流程与交付",
  "价格与合作方式",
  "客户案例与评价",
  "FAQ",
  "官方联系方式",
  "GEO 检索词与问法",
  "内容创作引用规则",
  "禁用与边界",
  "资料来源与待补充项",
] as const

export type EnterpriseSkillSection = typeof ENTERPRISE_SKILL_REQUIRED_SECTIONS[number]

export type EnterpriseSkillQualityReport = {
  score: number
  passed: boolean
  checks: string[]
  issues: string[]
  repaired?: boolean
}

const SECTION_ALIASES: Record<string, EnterpriseSkillSection> = {
  Overview: "Overview",
  概览: "Overview",
  品牌实体: "企业档案",
  企业档案: "企业档案",
  公司简介: "品牌与业务定位",
  品牌定位: "品牌与业务定位",
  品牌与业务定位: "品牌与业务定位",
  产品要点: "产品与服务",
  服务项目: "产品与服务",
  产品与服务: "产品与服务",
  目标客户: "客户与适用场景",
  适用场景: "客户与适用场景",
  客户与适用场景: "客户与适用场景",
  团队优势: "核心优势与证据",
  核心优势: "核心优势与证据",
  核心优势与证据: "核心优势与证据",
  团队与资质: "团队与资质",
  服务流程: "服务流程与交付",
  服务流程与交付: "服务流程与交付",
  收费标准: "价格与合作方式",
  价格与合作方式: "价格与合作方式",
  客户评价: "客户案例与评价",
  客户案例: "客户案例与评价",
  客户案例与评价: "客户案例与评价",
  常见问题: "FAQ",
  FAQ: "FAQ",
  官方联系方式: "官方联系方式",
  联系我们: "官方联系方式",
  "GEO 关键词": "GEO 检索词与问法",
  "GEO关键词": "GEO 检索词与问法",
  "GEO 检索词与问法": "GEO 检索词与问法",
  内容创作引用规则: "内容创作引用规则",
  禁用与边界: "禁用与边界",
  资料来源: "资料来源与待补充项",
  资料来源与待补充项: "资料来源与待补充项",
}

const SAFE_SECTION_CONTENT: Record<EnterpriseSkillSection, string> = {
  Overview: "待补充：请根据已提供资料完善企业的一句话定位。",
  企业档案: "- 企业基础信息：待补充",
  品牌与业务定位: "待补充：尚无足够资料形成可核验的品牌与业务定位。",
  产品与服务: "- 产品或服务：待补充",
  客户与适用场景: "- 适用客户与场景：待补充",
  核心优势与证据: "- 可核验优势与支持证据：待补充",
  团队与资质: "暂无可核验的团队履历或资质资料，待补充。",
  服务流程与交付: "- 服务流程、交付物与周期：待补充",
  价格与合作方式: "暂无可核验报价；具体价格以企业正式报价为准。",
  客户案例与评价: "暂无可核验的客户案例或客户评价，待补充。",
  FAQ: "",
  官方联系方式: "待补充：生成流程会以用户填写的官方联系方式确定性覆盖本章节。",
  "GEO 检索词与问法": "- 待补充：根据企业名称、产品与客户问题生成可核验问法。",
  内容创作引用规则:
    "- 只引用本知识库中有来源或已标记状态的事实。\n- 官方联系方式仅在用户明确要求联系、咨询、预约或购买时引用。",
  禁用与边界:
    "- 禁止编造数据、团队履历、资质、价格、客户案例或效果承诺。\n- 标记为待补充或待核验的内容不得作为确定事实发布。",
  资料来源与待补充项:
    "- 已使用资料：待补充\n- 待补充信息：团队资质、报价、案例等未提供内容。",
}

type ParsedSection = {
  heading: string
  body: string
}

function stripOuterFence(content: string): string {
  return content
    .trim()
    .replace(/^```(?:markdown|md)?\s*\r?\n/i, "")
    .replace(/\r?\n```\s*$/i, "")
    .trim()
}

function parseSections(content: string): { preamble: string; sections: ParsedSection[] } {
  const matches = [...content.matchAll(/^##\s+(.+?)\s*$/gm)]
  if (matches.length === 0) return { preamble: content.trim(), sections: [] }

  const preamble = content.slice(0, matches[0].index).trim()
  const sections = matches.map((match, index) => {
    const start = (match.index ?? 0) + match[0].length
    const end = matches[index + 1]?.index ?? content.length
    return {
      heading: match[1].trim(),
      body: content.slice(start, end).trim(),
    }
  })
  return { preamble, sections }
}

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = /^---\s*\r?\n[\s\S]*?\r?\n---\s*/.exec(content.trim())
  if (!match) {
    return {
      frontmatter:
        "---\nname: enterprise-kb\ndescription: Use when creating or reviewing content about this enterprise.\n---",
      body: content.trim(),
    }
  }
  return {
    frontmatter: normalizeFrontmatter(match[0].trim()),
    body: content.trim().slice(match[0].length).trim(),
  }
}

function normalizeFrontmatter(frontmatter: string): string {
  const body = frontmatter
    .replace(/^---\s*\r?\n/, "")
    .replace(/\r?\n---\s*$/, "")
  const lines = body.split(/\r?\n/)
  const nameIndex = lines.findIndex((line) => /^name\s*:/i.test(line))
  const descriptionIndex = lines.findIndex((line) => /^description\s*:/i.test(line))
  const currentName = nameIndex >= 0
    ? lines[nameIndex].replace(/^name\s*:\s*/i, "").replace(/^["']|["']$/g, "").trim()
    : ""
  const currentDescription = descriptionIndex >= 0
    ? lines[descriptionIndex]
      .replace(/^description\s*:\s*/i, "")
      .replace(/^["']|["']$/g, "")
      .trim()
    : ""

  const safeName = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(currentName)
    ? currentName
    : "enterprise-kb"
  const safeDescription = /^Use when\b/i.test(currentDescription)
    ? currentDescription
    : "Use when creating or reviewing content about this enterprise."

  if (nameIndex >= 0) lines[nameIndex] = `name: ${safeName}`
  else lines.unshift(`name: ${safeName}`)
  const resolvedDescriptionIndex = lines.findIndex((line) => /^description\s*:/i.test(line))
  if (resolvedDescriptionIndex >= 0) {
    lines[resolvedDescriptionIndex] = `description: ${safeDescription}`
  } else {
    lines.splice(1, 0, `description: ${safeDescription}`)
  }
  return `---\n${lines.join("\n")}\n---`
}

function countFaqs(body: string): number {
  const numbered = body.match(/^(?:###\s*)?(?:Q\s*)?\d+[.、：:）)]/gim) ?? []
  const questionHeadings = body.match(/^###\s+.+[？?]\s*$/gm) ?? []
  return Math.max(numbered.length, questionHeadings.length)
}

function ensureEightFaqs(body: string): string {
  const existing = countFaqs(body)
  if (existing >= 8) return body.trim()
  const additions = Array.from(
    { length: 8 - existing },
    (_, index) => {
      const number = existing + index + 1
      return `### Q${number}：待补充问题 ${number}？\n\n答：现有资料未提供，待补充。`
    },
  )
  return [body.trim(), ...additions].filter(Boolean).join("\n\n")
}

function hasEvidenceState(line: string): boolean {
  return /【(?:来源：[^】]+|用户提供|待核验)】/.test(line)
}

function isHighRiskFactLine(line: string): boolean {
  const value = line.trim()
  if (!value || /^#{1,6}\s/.test(value) || /^\|?\s*:?-{3,}/.test(value)) return false
  if (/^(name|description):/i.test(value)) return false

  const quantifiedOutcome = /(?:\d+(?:\.\d+)?%|节省|提升|降低|增长|成功率|转化率|准确率)/.test(value)
  const money = /(?:[￥¥]\s*\d|\d+(?:\.\d+)?\s*(?:元|万元|万\/年))/.test(value)
  const datedExperience = /(?:成立|运营|从业|经验|创立).{0,12}\d{4}年/.test(value)
  const teamOrScale = /(?:团队|员工|顾问|专家|客户|企业).{0,12}\d+\s*(?:人|名|位|家|户)/.test(value)
  const credentialOrTestimonial = /(?:资质|证书|许可证|专利|客户评价|客户反馈|客户表示|客户原话)/.test(value)
  return quantifiedOutcome || money || datedExperience || teamOrScale || credentialOrTestimonial
}

function unsupportedRiskLines(content: string): string[] {
  return content
    .split(/\r?\n/)
    .filter((line) => isHighRiskFactLine(line) && !hasEvidenceState(line))
}

function appendUnverifiedState(line: string): string {
  const trimmed = line.trimEnd()
  if (trimmed.trimStart().startsWith("|") && trimmed.endsWith("|")) {
    return `${trimmed.slice(0, -1).trimEnd()} 【待核验】 |`
  }
  return `${trimmed} 【待核验】`
}

export function normalizeEnterpriseSkill(content: string): string {
  const unfenced = stripOuterFence(content).replace(/\r\n/g, "\n")
  let insideFrontmatter = false
  let frontmatterClosed = false
  const lines = unfenced.split("\n").map((line, index) => {
    if (line.trim() === "---" && index === 0) {
      insideFrontmatter = true
      return line
    }
    if (line.trim() === "---" && insideFrontmatter) {
      insideFrontmatter = false
      frontmatterClosed = true
      return line
    }
    if (insideFrontmatter && !frontmatterClosed) return line
    if (isHighRiskFactLine(line) && !hasEvidenceState(line)) {
      return appendUnverifiedState(line)
    }
    return line
  })
  return `${lines.join("\n").trim()}\n`
}

export function ensureEnterpriseSkillSections(content: string): string {
  const { frontmatter, body } = splitFrontmatter(stripOuterFence(content))
  const parsed = parseSections(body)
  const sectionBodies = new Map<EnterpriseSkillSection, string>()

  for (const section of parsed.sections) {
    const canonical = SECTION_ALIASES[section.heading]
    if (!canonical || sectionBodies.has(canonical)) continue
    sectionBodies.set(canonical, section.body)
  }

  if (!sectionBodies.has("Overview") && parsed.preamble) {
    sectionBodies.set("Overview", parsed.preamble)
  }

  const blocks = ENTERPRISE_SKILL_REQUIRED_SECTIONS.map((heading) => {
    let sectionBody = sectionBodies.get(heading)?.trim() || SAFE_SECTION_CONTENT[heading]
    if (heading === "FAQ") sectionBody = ensureEightFaqs(sectionBody)
    return `## ${heading}\n\n${sectionBody}`
  })

  return `${frontmatter}\n\n${blocks.join("\n\n")}\n`
}

export function inspectEnterpriseSkill(content: string): EnterpriseSkillQualityReport {
  const checks: string[] = []
  const issues: string[] = []
  const raw = content.trim()
  const hasFence = /^```(?:markdown|md)?\s*/i.test(raw) || /```\s*$/.test(raw)

  const frontmatter = /^---\s*\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? ""
  const name = /^name:\s*["']?([^\r\n"']+)/m.exec(frontmatter)?.[1]?.trim() ?? ""
  const description = /^description:\s*["']?([^\r\n"']+)/m.exec(frontmatter)?.[1]?.trim() ?? ""
  const frontmatterValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && /^Use when\b/i.test(description)
  if (frontmatterValid) checks.push("frontmatter 合法")
  else issues.push("frontmatter 必须包含 kebab-case name 和以 Use when 开头的 description")

  const headings = [...raw.matchAll(/^##\s+(.+?)\s*$/gm)].map((match) => match[1].trim())
  const missing = ENTERPRISE_SKILL_REQUIRED_SECTIONS.filter((heading) => !headings.includes(heading))
  if (missing.length === 0) checks.push("16 个必需章节齐全")
  else issues.push(`缺少章节：${missing.join("、")}`)

  const orderedIndexes = ENTERPRISE_SKILL_REQUIRED_SECTIONS.map((heading) => headings.indexOf(heading))
  const ordered = missing.length === 0 && orderedIndexes.every(
    (value, index) => index === 0 || value > orderedIndexes[index - 1],
  )
  if (ordered) checks.push("章节顺序符合合同")
  else issues.push("章节顺序不符合企业知识库输出合同")

  const faqSection = parseSections(raw).sections.find((section) => section.heading === "FAQ")?.body ?? ""
  const faqCount = countFaqs(faqSection)
  if (faqCount >= 8) checks.push(`FAQ 数量达标（${faqCount}）`)
  else issues.push(`FAQ 至少需要 8 组，当前识别到 ${faqCount} 组`)

  if (!hasFence) checks.push("未使用外层代码围栏")
  else issues.push("输出不得包含 Markdown 代码围栏")

  const riskyLines = unsupportedRiskLines(raw)
  if (riskyLines.length === 0) checks.push("高风险事实均有来源状态")
  else issues.push(`发现 ${riskyLines.length} 行高风险事实缺少来源或待核验标记`)

  const sectionScore = Math.round(((ENTERPRISE_SKILL_REQUIRED_SECTIONS.length - missing.length) /
    ENTERPRISE_SKILL_REQUIRED_SECTIONS.length) * 40)
  const score = Math.max(0, Math.min(100,
    (frontmatterValid ? 15 : 0) +
    sectionScore +
    (ordered ? 10 : 0) +
    (faqCount >= 8 ? 15 : Math.round((faqCount / 8) * 15)) +
    (!hasFence ? 5 : 0) +
    (riskyLines.length === 0 ? 15 : 0),
  ))

  return {
    score,
    passed: issues.length === 0,
    checks,
    issues,
  }
}
