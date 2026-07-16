import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  ARTICLE_MAX_CHARS,
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
  it("caps total chars at 1000 including tag line", () => {
    const longBody = "甲".repeat(1200)
    const out = enforceArticleFormat(`# 大标题\n\n${longBody}\n\n标签：#A #B #C`, {
      title: "火山方舟实践",
      platformLabel: "知乎",
    })
    assert.ok(countChars(out) <= ARTICLE_MAX_CHARS)
    assert.match(out, /^标签：/m)
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
