const VERSION_HEADING_RE = /^#{1,6}\s*(版本[^\n#]*)\s*$/gm

const PROMPT_BRACKET_KEYWORDS = [
  "语气",
  "停顿",
  "镜头",
  "字幕",
  "动作",
  "节奏",
  "表情",
  "音量",
  "重音",
  "语速",
  "情绪",
  "语调",
  "卡点",
  "转场",
  "旁白提示",
  "播报提示",
  "演绎提示",
] as const

const EXPLANATORY_LABELS = [
  "适用场景",
  "创作思路",
  "说明",
  "备注",
  "总结",
  "开场说明",
  "结尾说明",
  "风格说明",
  "拍摄提示",
  "镜头提示",
  "字幕提示",
  "使用建议",
  "脚本说明",
  "口播说明",
] as const

const EXPLANATORY_HEADING_RE = new RegExp(
  `^#{1,6}\\s*(?:${EXPLANATORY_LABELS.join("|")})\\s*$`,
  "i",
)

const EXPLANATORY_LINE_RE = new RegExp(
  `^(?:${EXPLANATORY_LABELS.join("|")})\\s*[:：]`,
  "i",
)

export type CopywritingScriptVersion = {
  title: string | null
  markdown: string
  plainText: string
}

function normalizeInput(input: string): string {
  return input.replace(/\r\n?/g, "\n").trim()
}

function stripListMarker(line: string): string {
  return line.replace(/^\s*(?:[-*+]\s+|\d+[.)]\s+|>\s*)/, "")
}

function isPromptBracket(inner: string): boolean {
  const compact = inner.replace(/\s+/g, "")
  if (!compact) return false

  return PROMPT_BRACKET_KEYWORDS.some((keyword) => compact.includes(keyword))
}

function stripPromptBrackets(text: string): string {
  return text.replace(/[（(【\[]([^[\]【】()（）\n]+)[）)】\]]/g, (match, inner: string) => {
    return isPromptBracket(inner) ? "" : match
  })
}

function isVersionHeading(line: string): boolean {
  return /^#{1,6}\s*版本[^\n#]*\s*$/.test(line.trim())
}

function isExplanatoryParagraph(paragraph: string): boolean {
  const lines = paragraph
    .split("\n")
    .map((line) => stripListMarker(line).trim())
    .filter(Boolean)

  if (lines.length === 0) return false

  if (lines.every((line) => isVersionHeading(line))) return true

  const firstLine = lines[0]
  if (EXPLANATORY_HEADING_RE.test(firstLine)) return true

  return lines.every((line) => EXPLANATORY_LINE_RE.test(line))
}

function isExplanatoryLine(line: string): boolean {
  return EXPLANATORY_LINE_RE.test(stripListMarker(line).trim())
}

function sanitizeParagraph(paragraph: string): string {
  const sanitizedLines = paragraph
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !isVersionHeading(line))
    .filter((line) => !isExplanatoryLine(line))
    .map((line) => stripListMarker(line))
    .map((line) => stripPromptBrackets(line).trim())
    .filter(Boolean)

  return sanitizedLines.join("\n").trim()
}

export function sanitizeCopywritingPlainScript(input: string): string {
  const normalized = normalizeInput(input)
  if (!normalized) return ""

  const paragraphs = normalized.split(/\n\s*\n/)
  const sanitizedParagraphs = paragraphs
    .filter((paragraph) => !isExplanatoryParagraph(paragraph.trim()))
    .map((paragraph) => sanitizeParagraph(paragraph))
    .filter(Boolean)

  return sanitizedParagraphs.join("\n\n").replace(/\n{3,}/g, "\n\n").trim()
}

export function splitCopywritingScriptVersions(input: string): CopywritingScriptVersion[] {
  const normalized = normalizeInput(input)
  if (!normalized) return []

  const matches = [...normalized.matchAll(VERSION_HEADING_RE)]

  if (matches.length === 0) {
    const plainText = sanitizeCopywritingPlainScript(normalized)
    return [
      {
        title: null,
        markdown: normalized,
        plainText,
      },
    ]
  }

  return matches
    .map((match, index) => {
      const start = match.index ?? 0
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? normalized.length) : normalized.length
      const markdown = normalized.slice(start, end).trim()
      const plainText = sanitizeCopywritingPlainScript(markdown)

      return {
        title: match[1].trim(),
        markdown,
        plainText,
      }
    })
}
