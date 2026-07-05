import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { parseMarkdownOutline } from "@/lib/geo/markdown-outline"

describe("parseMarkdownOutline", () => {
  it("returns empty array when no headings", () => {
    assert.deepEqual(parseMarkdownOutline("plain text\nno headers"), [])
  })

  it("parses H1 H2 H3 with correct levels", () => {
    const md = `# 引言\n\n## 核心概念\n\n### 方法论\n\n## 证据与 FAQ`
    const items = parseMarkdownOutline(md)
    assert.equal(items.length, 4)
    assert.equal(items[0]!.title, "引言")
    assert.equal(items[0]!.level, 1)
    assert.equal(items[1]!.title, "核心概念")
    assert.equal(items[1]!.level, 2)
    assert.equal(items[2]!.title, "方法论")
    assert.equal(items[2]!.level, 3)
    assert.equal(items[3]!.title, "证据与 FAQ")
    assert.equal(items[3]!.level, 2)
  })

  it("generates unique ids for duplicate titles", () => {
    const md = `# 章节\n## 章节\n### 章节`
    const items = parseMarkdownOutline(md)
    assert.equal(items.length, 3)
    const ids = items.map((i) => i.id)
    assert.equal(new Set(ids).size, 3)
  })
})
