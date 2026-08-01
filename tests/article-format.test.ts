import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ARTICLE_HARD_MAX_CHARS,
  ARTICLE_MAX_CHARS,
  ARTICLE_TARGET_MAX_CHARS,
  ARTICLE_TARGET_MIN_CHARS,
  countChars,
  enforceArticleFormat,
  stripMarkdown,
} from "../lib/geo/article-format.ts"

describe("stripMarkdown", () => {
  it("removes headings lists code fences and emphasis", () => {
    const raw = `# 标题

> 引用

- 列表项
**加粗** *斜体*

\`\`\`json
{"a":1}
\`\`\`
`
    const out = stripMarkdown(raw)
    assert.equal(out.includes("#"), false)
    assert.equal(out.includes("**"), false)
    assert.equal(out.includes("```"), false)
    assert.equal(out.includes("{"), false)
    assert.match(out, /标题/)
    assert.match(out, /列表项/)
  })

  it("strips emoji and decorative chars", () => {
    const out = stripMarkdown("你好🎉 ◆测试▶")
    assert.equal(out.includes("🎉"), false)
    assert.equal(out.includes("◆"), false)
    assert.match(out, /你好/)
    assert.match(out, /测试/)
  })
})

describe("enforceArticleFormat", () => {
  it("uses the approved 900 1100 1200 limits", () => {
    assert.equal(ARTICLE_TARGET_MIN_CHARS, 900)
    assert.equal(ARTICLE_TARGET_MAX_CHARS, 1100)
    assert.equal(ARTICLE_HARD_MAX_CHARS, 1200)
    assert.equal(ARTICLE_MAX_CHARS, ARTICLE_HARD_MAX_CHARS)
  })

  it("normalizes without character-truncating the body", () => {
    const body = `# 标题\n\n${"完整句子。".repeat(300)}\n\n标签：#A #B #C`
    const out = enforceArticleFormat(body, {
      title: "标题",
      platformLabel: "知乎",
    })
    assert.match(out, /完整句子。\n\n标签：#A #B #C$/)
    assert.ok(countChars(out) > ARTICLE_HARD_MAX_CHARS)
  })

  it("appends fallback tags when model omits them", () => {
    const out = enforceArticleFormat("纯正文一段话，没有标签。", {
      title: "豆包引用权重",
      platformLabel: "小红书",
    })
    assert.match(out, /标签：#/)
    assert.match(out, /GEO优化/)
  })

  it("keeps plain text without markdown artifacts", () => {
    const out = enforceArticleFormat(
      "## 小节\n\n内容**强调**😊\n\n标签：#GEO #知乎 #AI搜索",
      { title: "小节", platformLabel: "知乎" },
    )
    assert.equal(out.includes("##"), false)
    assert.equal(out.includes("**"), false)
    assert.equal(out.includes("😊"), false)
    assert.match(out, /标签：#GEO/)
  })
})
