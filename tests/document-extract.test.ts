import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  extractDocumentText,
  extractDocuments,
} from "@/lib/server/document-extract"
import { isSupportedDocumentName } from "@/lib/ip-positioning-upload"

describe("document extract", () => {
  it("isSupportedDocumentName accepts expected extensions", () => {
    assert.equal(isSupportedDocumentName("resume.pdf"), true)
    assert.equal(isSupportedDocumentName("notes.txt"), true)
    assert.equal(isSupportedDocumentName("plan.docx"), true)
    assert.equal(isSupportedDocumentName("slides.pptx"), false)
  })

  it("extractDocumentText parses plain text files", async () => {
    const text = "我是运营总监，擅长增长策略。"
    const base64 = Buffer.from(text, "utf8").toString("base64")
    const result = await extractDocumentText({
      name: "profile.txt",
      type: "text/plain",
      size: text.length,
      base64,
    })
    assert.equal(result.text, text)
    assert.equal(result.truncated, false)
    assert.equal(result.error, undefined)
  })

  it("extractDocumentText rejects unsupported formats", async () => {
    const result = await extractDocumentText({
      name: "deck.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: 10,
      base64: Buffer.from("abc").toString("base64"),
    })
    assert.match(result.error ?? "", /不支持/)
  })

  it("extractDocuments caps total files", async () => {
    const makeTxt = (i: number) => {
      const text = `doc-${i}`
      return {
        name: `${i}.txt`,
        type: "text/plain",
        size: text.length,
        base64: Buffer.from(text, "utf8").toString("base64"),
      }
    }
    const files = Array.from({ length: 8 }, (_, i) => makeTxt(i))
    const results = await extractDocuments(files)
    assert.equal(results.length, 5)
  })
})
