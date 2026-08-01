export type ArticleStructureId = "beginner" | "comparison" | "faq" | "case_story"

export type ArticleStructureInput = {
  title: string
  brief: string
  format?: string | null
}

export type ArticleStructureCheck = {
  sectionCount: number
  missingEnding: boolean
}

const INTENTS: Record<ArticleStructureId, RegExp> = {
  comparison: /对比|比较|区别|优缺点|哪个好|怎么选|\bvs\b/i,
  faq: /避坑|踩坑|误区|风险|注意事项|常见问题|FAQ/i,
  case_story: /案例|经历|复盘|经验分享|真实体验|过来人|故事/i,
  beginner: /新手|入门|教程|步骤|清单|怎么办|必做|指南/i,
}

const STRUCTURE_PRIORITY: ArticleStructureId[] = [
  "comparison",
  "faq",
  "case_story",
  "beginner",
]

const STRUCTURE_PROMPTS: Record<ArticleStructureId, string> = {
  beginner: `结构类型：新手清单
开篇先说明读者痛点、适用范围和核心结论。
正文使用 3–5 个明确小节，每节依次回答“要做什么、为什么、怎么做”。
结尾给出执行顺序或避坑提醒，可补充 1–2 个高频问答。`,
  comparison: `结构类型：对比问答
开篇说明比较对象、比较范围和适用人群。
正文围绕成本、能力、风险、适用场景等 3–4 个维度，用自然问答展开。
结尾按不同条件给出选择建议，不给无条件的绝对结论。`,
  faq: `结构类型：避坑 FAQ
开篇说明风险发生的典型场景。
正文使用 3–5 个“问题表现、可能后果、规避方法”小节。
结尾给出简短检查清单，并补充 1–2 个高频问题。`,
  case_story: `结构类型：真实案例分享
开篇交代案例背景，并明确案例只代表特定情境。
正文按“遇到的问题、采取的动作、结果与限制、可复制建议”组织 3–5 个小节。
结尾总结适用条件和不适用条件，不虚构第一人称经历。`,
}

const SECTION_HEADING_RE =
  /^(?:[一二三四五六七八九十]+[、.．]|第[一二三四五六七八九十\d]+(?:步|点|项|个|种|问|坑)[：:]?|坑[一二三四五六七八九十\d]+[：:]|问题[一二三四五六七八九十\d]+[：:]|Q(?:\d+)?[：:])/i

const ENDING_HEADING_RE =
  /^(?:总结|结语|最后|写在最后|行动建议|检查清单|常见问题|高频问题)/

function matchStructure(text: string): ArticleStructureId | null {
  for (const id of STRUCTURE_PRIORITY) {
    if (INTENTS[id].test(text)) return id
  }
  return null
}

export function selectArticleStructure(input: ArticleStructureInput): ArticleStructureId {
  const fromFormat = matchStructure(input.format?.trim() ?? "")
  if (fromFormat) return fromFormat
  return matchStructure(`${input.title}\n${input.brief}`) ?? "beginner"
}

export function getArticleStructurePrompt(id: ArticleStructureId): string {
  return STRUCTURE_PROMPTS[id]
}

export function validateArticleStructure(text: string): ArticleStructureCheck {
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)

  const sectionCount = lines.filter((line) => SECTION_HEADING_RE.test(line)).length
  const missingEnding = !lines.some((line) => ENDING_HEADING_RE.test(line))

  return { sectionCount, missingEnding }
}
