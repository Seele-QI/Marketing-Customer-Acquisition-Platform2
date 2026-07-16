import type { ExtractedDocument, UploadedDocumentPayload } from "@/lib/ip-positioning-schema"
import {
  MAX_DOCUMENT_BYTES,
  MAX_DOCUMENTS,
} from "@/lib/ip-positioning-upload"

export { MAX_DOCUMENT_BYTES, MAX_DOCUMENTS } from "@/lib/ip-positioning-upload"

export const MAX_EXTRACTED_CHARS_PER_FILE = 8_000
export const MAX_TOTAL_EXTRACTED_CHARS = 20_000

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".markdown"])
const DOCX_EXTENSIONS = new Set([".docx"])
const PDF_EXTENSIONS = new Set([".pdf"])

function getExtension(name: string): string {
  const idx = name.lastIndexOf(".")
  if (idx < 0) return ""
  return name.slice(idx).toLowerCase()
}

function decodeBase64(base64: string): Buffer {
  return Buffer.from(base64, "base64")
}

function trimExtractedText(text: string, maxChars: number): { text: string; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim()
  if (normalized.length <= maxChars) {
    return { text: normalized, truncated: false }
  }
  return { text: normalized.slice(0, maxChars), truncated: true }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  let PDFParse: typeof import("pdf-parse").PDFParse
  try {
    ;({ PDFParse } = await import("pdf-parse"))
  } catch {
    throw new Error("PDF 解析模块未安装")
  }
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text ?? ""
  } finally {
    await parser.destroy()
  }
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  let mammoth: typeof import("mammoth")
  try {
    mammoth = (await import("mammoth")).default
  } catch {
    throw new Error("DOCX 解析模块未安装")
  }
  const result = await mammoth.extractRawText({ buffer })
  return result.value ?? ""
}

function extractPlainText(buffer: Buffer): string {
  return buffer.toString("utf8")
}

export async function extractDocumentText(
  file: UploadedDocumentPayload,
): Promise<ExtractedDocument> {
  const base: Omit<ExtractedDocument, "text" | "truncated" | "error"> = {
    name: file.name,
    type: file.type,
    size: file.size,
  }

  if (!file.base64?.trim()) {
    return { ...base, text: "", truncated: false, error: "缺少文件内容" }
  }

  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ...base, text: "", truncated: false, error: "文件超过 20MB 限制" }
  }

  let buffer: Buffer
  try {
    buffer = decodeBase64(file.base64)
  } catch {
    return { ...base, text: "", truncated: false, error: "Base64 解码失败" }
  }

  const ext = getExtension(file.name)
  try {
    let raw = ""
    if (PDF_EXTENSIONS.has(ext) || file.type === "application/pdf") {
      raw = await extractPdfText(buffer)
    } else if (
      DOCX_EXTENSIONS.has(ext) ||
      file.type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      raw = await extractDocxText(buffer)
    } else if (TEXT_EXTENSIONS.has(ext) || file.type.startsWith("text/")) {
      raw = extractPlainText(buffer)
    } else if (ext === ".doc") {
      return {
        ...base,
        text: "",
        truncated: false,
        error: "暂不支持旧版 .doc，请转换为 .docx 后上传",
      }
    } else {
      return {
        ...base,
        text: "",
        truncated: false,
        error: "暂不支持该文件格式，请上传 Word/PDF/TXT/MD",
      }
    }

    const { text, truncated } = trimExtractedText(raw, MAX_EXTRACTED_CHARS_PER_FILE)
    if (!text) {
      return { ...base, text: "", truncated: false, error: "未能提取有效正文（可能是扫描版 PDF）" }
    }
    return { ...base, text, truncated }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ...base, text: "", truncated: false, error: msg.slice(0, 200) }
  }
}

export async function extractDocuments(
  files: UploadedDocumentPayload[] | undefined,
): Promise<ExtractedDocument[]> {
  if (!Array.isArray(files) || files.length === 0) return []

  const slice = files.slice(0, MAX_DOCUMENTS)
  const results: ExtractedDocument[] = []
  let totalChars = 0

  for (const file of slice) {
    const doc = await extractDocumentText(file)
    if (doc.text && totalChars + doc.text.length > MAX_TOTAL_EXTRACTED_CHARS) {
      const remaining = MAX_TOTAL_EXTRACTED_CHARS - totalChars
      if (remaining > 0) {
        results.push({
          ...doc,
          text: doc.text.slice(0, remaining),
          truncated: true,
        })
      }
      break
    }
    results.push(doc)
    totalChars += doc.text.length
  }

  return results
}

export { isSupportedDocumentName } from "@/lib/ip-positioning-upload"
