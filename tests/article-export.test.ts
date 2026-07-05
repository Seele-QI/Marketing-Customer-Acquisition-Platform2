import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  formatArticleMarkdown,
  sanitizeArticleFilename,
  articleWordCount,
} from "@/lib/geo/article-export"

describe("formatArticleMarkdown", () => {
  it("includes YAML frontmatter fields", () => {
    const out = formatArticleMarkdown(
      {
        title: "测试文章",
        platformId: "xiaohongshu",
        date: "2025-06-29",
        createdAt: Date.parse("2026-07-05T00:00:00.000Z"),
      },
      "# 测试文章\n\n正文内容",
    )
    assert.match(out, /^---\n/)
    assert.match(out, /title: "测试文章"/)
    assert.match(out, /platform: "小红书"/)
    assert.match(out, /date: "2025-06-29"/)
    assert.match(out, /wordCount: \d+/)
    assert.match(out, /# 测试文章/)
    assert.match(out, /正文内容/)
  })
})

describe("sanitizeArticleFilename", () => {
  it("removes illegal path characters", () => {
    assert.equal(sanitizeArticleFilename('foo/bar:baz'), "foo_bar_baz")
  })

  it("falls back when empty", () => {
    assert.equal(sanitizeArticleFilename("   "), "geo-article")
  })
})

describe("articleWordCount", () => {
  it("counts non-whitespace characters", () => {
    assert.equal(articleWordCount("a b c"), 3)
  })
})
