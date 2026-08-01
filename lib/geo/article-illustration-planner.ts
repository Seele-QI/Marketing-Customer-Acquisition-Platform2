import {
  resolveArticleIllustrationRatio,
  type ArticleIllustrationItem,
  type ArticleIllustrationPlanItem,
} from "@/lib/geo/article-illustration-types"

type PlanInput = {
  projectId: string
  articleId: string
  platformId: string
  title: string
  markdown: string
  count: number
}

type MarkdownSection = {
  heading: string
  occurrence: number
  headingLine: number
  endLine: number
  bodyLines: string[]
}

const PROTECTED_HEADING =
  /联系方式|联系我们|咨询方式|官方信息|总结|结语|免责声明|FAQ|常见问题|标签/i
const CONTACT_CONTENT =
  /(?:联系人|联系电话|电话|手机|微信|邮箱|地址|官网)\s*[：:]/
const IMAGE_LINE = /^\s*!\[[^\]]*]\([^)]+\)\s*$/
const GENERATED_MARKER = /^\s*<!--\s*geo-article-illustration:/

function stableId(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `ill-${(hash >>> 0).toString(36)}`
}

function parseSections(markdown: string): MarkdownSection[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const headings: Array<{ heading: string; line: number }> = []
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.match(/^#{2,3}\s+(.+?)\s*$/)
    if (match) headings.push({ heading: match[1]!.trim(), line: index })
  }
  const occurrences = new Map<string, number>()
  return headings.map((entry, index) => {
    const occurrence = (occurrences.get(entry.heading) ?? 0) + 1
    occurrences.set(entry.heading, occurrence)
    const endLine = headings[index + 1]?.line ?? lines.length
    return {
      heading: entry.heading,
      occurrence,
      headingLine: entry.line,
      endLine,
      bodyLines: lines.slice(entry.line + 1, endLine),
    }
  })
}

function sectionText(section: MarkdownSection): string {
  return section.bodyLines
    .filter((line) => !GENERATED_MARKER.test(line) && !IMAGE_LINE.test(line))
    .join(" ")
    .replace(/[`*_>#-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isSafeSection(section: MarkdownSection): boolean {
  if (PROTECTED_HEADING.test(section.heading)) return false
  if (CONTACT_CONTENT.test(section.bodyLines.join("\n"))) return false
  const meaningful = section.bodyLines.filter((line) => line.trim())
  if (meaningful.some((line) => IMAGE_LINE.test(line) || GENERATED_MARKER.test(line))) {
    return false
  }
  return sectionText(section).length >= 18
}

function buildPrompt(
  input: PlanInput,
  section: MarkdownSection,
  index: number,
): string {
  const excerpt = sectionText(section).slice(0, 800)
  const composition = [
    "清晰的编辑插画构图，主体明确，留有自然呼吸感",
    "信息图式场景构图，用物件和空间关系表达逻辑",
    "纪实商业摄影感构图，以真实工作场景表达主题",
    "简洁概念视觉构图，用符号化元素表达核心含义",
    "层次分明的横纵深构图，避免与前文插图重复",
  ][index % 5]
  return [
    `为文章《${input.title}》的“${section.heading}”章节创作一张最终编辑插图。`,
    `章节内容摘要：${excerpt}`,
    `视觉要求：${composition}。`,
    "画面必须准确、中性、专业，不虚构企业资质、证书、数据、人物身份或联系方式。",
    "不要生成文字、水印、Logo 或二维码，不要添加边框，不要做拼贴候选图。",
    "只输出一张可直接用于文章正文的完整插图。",
  ].join("\n")
}

function sanitizeAlt(value: string): string {
  return value
    .replace(/[\r\n[\]()`*_#!<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
}

export function planArticleIllustrations(
  input: PlanInput,
): ArticleIllustrationPlanItem[] {
  const count = Math.max(0, Math.min(5, Math.round(input.count)))
  const sections = parseSections(input.markdown).filter(isSafeSection)
  const aspectRatio = resolveArticleIllustrationRatio(input.platformId)
  return sections.slice(0, count).map((section, index) => ({
    illustrationId: stableId(
      `${input.projectId}|${input.articleId}|${section.heading}|${section.occurrence}`,
    ),
    anchorHeading: section.heading,
    anchorOccurrence: section.occurrence,
    alt: sanitizeAlt(`${input.title}：${section.heading}示意图`),
    status: "queued",
    prompt: buildPrompt(input, section, index),
    aspectRatio,
    resolution: "1k",
  }))
}

function safeGeneratedUrl(value: string | undefined): value is string {
  return Boolean(
    value &&
      /^\/static\/geo-article-illustrations\/[A-Za-z0-9._/-]+\.png$/.test(value),
  )
}

function findInsertionIndex(
  lines: string[],
  heading: string,
  occurrence: number,
): number | null {
  let seen = 0
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index]!.match(/^#{2,3}\s+(.+?)\s*$/)
    if (!match || match[1]!.trim() !== heading) continue
    seen += 1
    if (seen !== occurrence) continue

    const sectionEnd = lines.findIndex(
      (line, candidate) => candidate > index && /^#{2,3}\s+/.test(line),
    )
    const end = sectionEnd === -1 ? lines.length : sectionEnd
    let paragraphStarted = false
    for (let candidate = index + 1; candidate < end; candidate += 1) {
      const text = lines[candidate]!.trim()
      if (!text) {
        if (paragraphStarted) return candidate + 1
        continue
      }
      if (IMAGE_LINE.test(text) || GENERATED_MARKER.test(text)) return null
      paragraphStarted = true
    }
    return paragraphStarted ? end : null
  }
  return null
}

export function applyArticleIllustrations(
  markdown: string,
  items: ArticleIllustrationItem[],
): { markdown: string; unplaced: string[] } {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const unplaced: string[] = []
  for (const item of items) {
    if (item.status !== "success") continue
    const marker = `<!-- geo-article-illustration:${item.illustrationId} -->`
    if (lines.some((line) => line.trim() === marker)) continue
    if (!safeGeneratedUrl(item.imageUrl)) {
      unplaced.push(item.illustrationId)
      continue
    }
    const insertAt = findInsertionIndex(
      lines,
      item.anchorHeading,
      item.anchorOccurrence,
    )
    if (insertAt === null) {
      unplaced.push(item.illustrationId)
      continue
    }
    lines.splice(
      insertAt,
      0,
      marker,
      `![${sanitizeAlt(item.alt) || "文章插图"}](${item.imageUrl})`,
      "",
    )
  }
  return { markdown: lines.join("\n"), unplaced }
}
