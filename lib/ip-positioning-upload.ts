/** 客户端/服务端共享的上传约束（不含解析逻辑） */

export const MAX_DOCUMENTS = 5
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024
export const ACCEPTED_DOCUMENT_EXTENSIONS = ".pdf,.docx,.txt,.md,.markdown"

export function isSupportedDocumentName(name: string): boolean {
  const idx = name.lastIndexOf(".")
  if (idx < 0) return false
  const ext = name.slice(idx).toLowerCase()
  return [".pdf", ".docx", ".txt", ".md", ".markdown"].includes(ext)
}
