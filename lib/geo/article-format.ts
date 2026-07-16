/**
 * GEO 文章创作·纯文本格式化与硬约束。
 *
 * 目标（用户需求）：
 *  1. 所有平台文章字数不超过 1000 字（非空白字符计数，含标点与标签）。
 *  2. 纯文本，不出现 Markdown 标记与 emoji / 装饰性奇异字符。
 *  3. 文末带话题标签（「标签：#a #b …」）；模型未给出时按标题/平台兜底生成。
 *
 * 该模块为确定性后处理，无论模型是否遵循提示词都能保证产出符合上述约束。
 */

/** 单篇文章字数上限（与前端 articleWordCount 一致：非空白字符计数） */
export const ARTICLE_MAX_CHARS = 1000

/** 标签行前缀 */
const TAG_PREFIX = "标签："

/** 非空白字符计数（与 lib/geo/article-export.ts::articleWordCount 保持一致） */
export function countChars(text: string): number {
  return text.replace(/\s/g, "").length
}

/**
 * 需要清除的「奇异字符」：emoji、装饰符号、几何/箭头/方框、零宽字符等。
 * 注意：刻意避开中文标点（，。！？、；：""''（）《》——…）与常规 ASCII 标点。
 */
const STRIP_WEIRD =
  /[\u200B-\u200D\uFEFF\uFE00-\uFE0F\u20E3\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u2B00-\u2BFF\u2022]|[\u{1F000}-\u{1FAFF}]|[\u{1F1E6}-\u{1F1FF}]/gu

const SENTENCE_TERMINATORS = ["。", "！", "？", "!", "?", "…", "\n"]

/** 去掉一段文本里的 Markdown 语法，转为纯文本（不动话题标签里的 #）。 */
export function stripMarkdown(input: string): string {
  let text = input.replace(/\r\n?/g, "\n")

  // 1) 移除围栏代码块（```lang ... ```）整段，含 JSON-LD / Schema
  text = text.replace(/```[\s\S]*?```/g, "")
  text = text.replace(/~~~[\s\S]*?~~~/g, "")

  // 2) 行内代码 `x` -> x
  text = text.replace(/`([^`]*)`/g, "$1")

  // 3) 图片 ![alt](url) -> 删除
  text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, "")

  // 4) 链接 [text](url) -> text
  text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")

  const lines = text.split("\n").map((rawLine) => {
    let line = rawLine

    // 表格分隔行 |---|:--:| -> 删除
    if (/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line)) {
      return ""
    }
    // 分隔线 --- *** ___
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      return ""
    }
    // 标题符号 ## / ### （行首）
    line = line.replace(/^\s{0,3}#{1,6}\s+/, "")
    // 引用符号 > （行首，可嵌套）
    line = line.replace(/^\s{0,3}(?:>\s?)+/, "")
    // 无序列表符号 - * + （行首）
    line = line.replace(/^\s{0,3}[-*+]\s+/, "")
    // 有序列表 "1. " 保留数字，去掉多余缩进
    line = line.replace(/^\s{0,3}(\d+)[.)]\s+/, "$1. ")
    // 表格竖线：转成两个空格
    if (line.includes("|")) {
      line = line
        .replace(/^\s*\|/, "")
        .replace(/\|\s*$/, "")
        .replace(/\s*\|\s*/g, "  ")
    }
    return line
  })

  text = lines.join("\n")

  // 5) 去粗体/斜体/删除线的成对符号
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1")
  text = text.replace(/\*([^*\n]+)\*/g, "$1")
  text = text.replace(/__([^_]+)__/g, "$1")
  text = text.replace(/~~([^~]+)~~/g, "$1")
  // 残留的孤立 markdown 强调符号
  text = text.replace(/\*+/g, "")

  // 6) 清除 emoji / 装饰性奇异字符
  text = text.replace(STRIP_WEIRD, "")

  // 7) 折叠多余空行与行尾空格
  text = text
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")

  return text.trim()
}

/** 从纯文本里分离末尾的标签行；返回正文与标签数组。 */
function splitTags(text: string): { body: string; tags: string[] } {
  const lines = text.split("\n")

  // 从后往前找最后一个非空行
  let lastIdx = lines.length - 1
  while (lastIdx >= 0 && lines[lastIdx]!.trim() === "") lastIdx--
  if (lastIdx < 0) return { body: text.trim(), tags: [] }

  const lastLine = lines[lastIdx]!.trim()
  const withoutPrefix = lastLine
    .replace(/^(标签|標籤|tags?|话题)\s*[:：]\s*/i, "")
    .trim()

  const hashCount = (lastLine.match(/#/g) ?? []).length
  const looksLikeTagLine =
    /^(标签|標籤|tags?|话题)\s*[:：]/i.test(lastLine) ||
    (hashCount >= 1 && withoutPrefix.replace(/[#\s]/g, "").length <= 60 && hashCount >= 2)

  if (!looksLikeTagLine) {
    return { body: text.trim(), tags: [] }
  }

  const tags = normalizeTags(withoutPrefix)
  const body = lines.slice(0, lastIdx).join("\n").trim()
  return { body, tags }
}

/** 规范化标签集合：拆分 -> 去 # / 空白 -> 去重 -> 3~6 个。 */
function normalizeTags(raw: string): string[] {
  const parts = raw
    .split(/[#＃\s,，、]+/)
    .map((t) => t.replace(/[#＃]/g, "").trim())
    .filter(Boolean)

  const seen = new Set<string>()
  const tags: string[] = []
  for (const p of parts) {
    const tag = p.slice(0, 12)
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
    if (tags.length >= 6) break
  }
  return tags
}

/** 根据标题/平台兜底生成标签（模型未给出时）。 */
function deriveFallbackTags(title: string, platformLabel?: string): string[] {
  const tags: string[] = []
  const seen = new Set<string>()
  const push = (t?: string) => {
    const tag = (t ?? "").replace(/[#＃\s]/g, "").slice(0, 12)
    if (tag && !seen.has(tag)) {
      seen.add(tag)
      tags.push(tag)
    }
  }

  // 从标题里取首个有意义片段（按常见分隔符切）
  const head = title
    .split(/[·|｜\-—（(【\[]/)[0]
    ?.replace(/[《》"“”'']/g, "")
    .trim()
  if (head && head.length <= 12) push(head)

  push("GEO优化")
  if (platformLabel) push(platformLabel)
  push("AI搜索")
  push("内容营销")

  return tags.slice(0, 4)
}

function buildTagLine(tags: string[]): string {
  return `${TAG_PREFIX}${tags.map((t) => `#${t}`).join(" ")}`
}

/** 按字数预算截断正文：优先在句子边界处收尾。 */
function truncateToBudget(text: string, budget: number): string {
  if (budget <= 0) return ""
  if (countChars(text) <= budget) return text

  let nonWs = 0
  let cut = text.length
  for (let i = 0; i < text.length; i++) {
    if (!/\s/.test(text[i]!)) nonWs++
    if (nonWs > budget) {
      cut = i
      break
    }
  }

  let slice = text.slice(0, cut)
  let best = -1
  for (const t of SENTENCE_TERMINATORS) {
    best = Math.max(best, slice.lastIndexOf(t))
  }
  // 只有当句子边界不过分靠前时才回退，避免把正文砍掉大半
  if (best >= 0 && best >= slice.length * 0.5) {
    slice = slice.slice(0, best + 1)
  }
  return slice.trim()
}

export type EnforceArticleContext = {
  title?: string
  platformLabel?: string
}

/**
 * 对模型产出施加全部硬约束：纯文本 + ≤1000 字 + 带规范化标签。
 */
export function enforceArticleFormat(
  raw: string,
  ctx: EnforceArticleContext = {},
): string {
  const plain = stripMarkdown(raw)
  const { body, tags } = splitTags(plain)

  const finalTags =
    tags.length > 0 ? tags : deriveFallbackTags(ctx.title ?? "", ctx.platformLabel)
  const tagLine = finalTags.length > 0 ? buildTagLine(finalTags) : ""

  // 预算 = 上限 - 标签行字数 - 分隔缓冲
  const tagChars = tagLine ? countChars(tagLine) : 0
  const budget = ARTICLE_MAX_CHARS - tagChars

  const trimmedBody = truncateToBudget(body.trim(), budget)

  if (!tagLine) return trimmedBody
  if (!trimmedBody) return tagLine
  return `${trimmedBody}\n\n${tagLine}`
}
