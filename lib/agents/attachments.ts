import { isSupportedDocumentName, MAX_DOCUMENT_BYTES, MAX_DOCUMENTS } from "@/lib/ip-positioning-upload"
import { MAX_IMAGE_FILE_BYTES, MAX_PENDING_IMAGES, fileToBase64Data } from "@/lib/chat-image-upload"

export type AgentAttachmentScope = "temporary" | "company" | "department"
export type AgentAttachmentStatus = "preparing" | "ready" | "failed"

export type AgentAttachment = {
  id: string
  kind: "image" | "document"
  scope: AgentAttachmentScope
  status: AgentAttachmentStatus
  name: string
  type: string
  size: number
  previewUrl?: string
  dataBase64?: string
  extractedText?: string
  truncated?: boolean
  error?: string
}

export type RejectedAgentFile = { file: File; reason: string }

export const AGENT_ATTACHMENT_ACCEPT =
  "image/*,.pdf,.docx,.txt,.md,.markdown,.csv,.xlsx,.pptx"

export function validateAgentAttachmentFiles(
  files: readonly File[],
  existing: { images?: number; documents?: number } = {},
): { accepted: File[]; rejected: RejectedAgentFile[] } {
  let images = Math.max(0, existing.images ?? 0)
  let documents = Math.max(0, existing.documents ?? 0)
  const accepted: File[] = []
  const rejected: RejectedAgentFile[] = []
  for (const file of files) {
    const isImage = file.type.startsWith("image/")
    const maxBytes = isImage ? MAX_IMAGE_FILE_BYTES : MAX_DOCUMENT_BYTES
    if (file.size <= 0 || file.size > maxBytes) {
      rejected.push({ file, reason: "文件为空或超过 20MB 限制" })
      continue
    }
    if (isImage) {
      if (images >= MAX_PENDING_IMAGES) {
        rejected.push({ file, reason: `图片最多 ${MAX_PENDING_IMAGES} 张` })
        continue
      }
      images += 1
    } else {
      if (!isSupportedDocumentName(file.name)) {
        rejected.push({ file, reason: "不支持该文件格式" })
        continue
      }
      if (documents >= MAX_DOCUMENTS) {
        rejected.push({ file, reason: `文档最多 ${MAX_DOCUMENTS} 个` })
        continue
      }
      documents += 1
    }
    accepted.push(file)
  }
  return { accepted, rejected }
}

export function createPreparingAgentAttachment(
  file: File,
  scope: AgentAttachmentScope = "temporary",
): AgentAttachment {
  const kind = file.type.startsWith("image/") ? "image" : "document"
  return {
    id: crypto.randomUUID(),
    kind,
    scope,
    status: "preparing",
    name: file.name,
    type: file.type || "application/octet-stream",
    size: file.size,
    ...(kind === "image" ? { previewUrl: URL.createObjectURL(file) } : {}),
  }
}

export async function prepareAgentAttachment(
  attachment: AgentAttachment,
  file: File,
  options: { signal?: AbortSignal; fetchImpl?: typeof fetch } = {},
): Promise<AgentAttachment> {
  try {
    const dataBase64 = (await fileToBase64Data(file)).replace(/\s/g, "")
    if (options.signal?.aborted) throw new DOMException("Aborted", "AbortError")
    if (attachment.kind === "image") {
      return { ...attachment, status: "ready", dataBase64 }
    }
    const response = await (options.fetchImpl ?? fetch)("/api/agents/attachments/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        base64: dataBase64,
      }),
      signal: options.signal,
    })
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>
    if (!response.ok || typeof body.text !== "string" || !body.text.trim()) {
      throw new Error(typeof body.error === "string" ? body.error : "文件解析失败")
    }
    return {
      ...attachment,
      status: "ready",
      extractedText: body.text,
      truncated: body.truncated === true,
    }
  } catch (error) {
    return {
      ...attachment,
      status: "failed",
      error:
        error instanceof DOMException && error.name === "AbortError"
          ? "已取消"
          : error instanceof Error
            ? error.message
            : "文件解析失败",
    }
  }
}

export function releaseAgentAttachment(attachment: AgentAttachment): void {
  if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
}

export function buildReadyAttachmentPayload(attachments: readonly AgentAttachment[]) {
  const ready = attachments.filter((attachment) => attachment.status === "ready")
  return {
    evidence: ready
      .filter((attachment) => attachment.kind === "document" && attachment.extractedText)
      .map((attachment) => ({
        source: `${attachment.scope}:${attachment.name}`,
        text: attachment.extractedText as string,
      })),
    images: ready
      .filter((attachment) => attachment.kind === "image" && attachment.dataBase64)
      .map((attachment) => ({
        mimeType: attachment.type || "image/jpeg",
        dataBase64: attachment.dataBase64 as string,
        source: `${attachment.scope}:${attachment.name}`,
      })),
  }
}

