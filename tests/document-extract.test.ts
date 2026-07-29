import assert from "node:assert/strict"
import { describe, it } from "node:test"
import JSZip from "jszip"

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
    assert.equal(isSupportedDocumentName("slides.pptx"), true)
    assert.equal(isSupportedDocumentName("budget.xlsx"), true)
    assert.equal(isSupportedDocumentName("leads.csv"), true)
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

  it("extractDocumentText parses XLSX shared strings and values", async () => {
    const zip = new JSZip()
    zip.file("xl/sharedStrings.xml", "<sst><si><t>项目</t></si><si><t>金额</t></si></sst>")
    zip.file(
      "xl/worksheets/sheet1.xml",
      '<worksheet><sheetData><row r="1"><c t="s"><v>0</v></c><c t="s"><v>1</v></c></row><row r="2"><c><v>增长计划</v></c><c><v>120000</v></c></row></sheetData></worksheet>',
    )
    const bytes = await zip.generateAsync({ type: "nodebuffer" })
    const result = await extractDocumentText({
      name: "budget.xlsx",
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size: bytes.length,
      base64: bytes.toString("base64"),
    })
    assert.match(result.text, /项目/)
    assert.match(result.text, /120000/)
    assert.equal(result.error, undefined)
  })

  it("extractDocumentText parses PPTX slide text in slide order", async () => {
    const zip = new JSZip()
    zip.file("ppt/slides/slide2.xml", "<p:sld><a:t>第二页</a:t></p:sld>")
    zip.file("ppt/slides/slide1.xml", "<p:sld><a:t>公司方案</a:t><a:t>第一阶段</a:t></p:sld>")
    const bytes = await zip.generateAsync({ type: "nodebuffer" })
    const result = await extractDocumentText({
      name: "deck.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      size: bytes.length,
      base64: bytes.toString("base64"),
    })
    assert.match(result.text, /公司方案/)
    assert.ok(result.text.indexOf("公司方案") < result.text.indexOf("第二页"))
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

  it("rejects MIME and extension conflicts", async () => {
    const result = await extractDocumentText({
      name: "contract.txt",
      type: "application/pdf",
      size: 10,
      base64: Buffer.from("plain text").toString("base64"),
    })
    assert.match(result.error ?? "", /不一致/)
  })
})
