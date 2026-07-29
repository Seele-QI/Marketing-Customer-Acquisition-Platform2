import { getAgentById } from "@/lib/agents/registry"
import type { EvidenceItem } from "@/lib/agents/prompts"
import type { AgentImageEvidence } from "@/lib/agents/orchestrator"

const MAX_PROMPT_CHARS = 40_000
const MAX_EVIDENCE_ITEMS = 24
const MAX_EVIDENCE_CHARS = 20_000
const MAX_IMAGES = 6
const MAX_IMAGE_BASE64_CHARS = 28_000_000

export type SanitizedAgentRunRequest = {
  agentId: string
  prompt: string
  collaboration: boolean
  evidence: EvidenceItem[]
  images: AgentImageEvidence[]
}

export type AgentRunRequestValidation =
  | { ok: true; value: SanitizedAgentRunRequest }
  | { ok: false; status: 400; detail: string }

export function sanitizeAgentRunRequest(raw: unknown): AgentRunRequestValidation {
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: 400, detail: "请求体须为 JSON 对象" }
  }
  const body = raw as Record<string, unknown>
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : ""
  if (!getAgentById(agentId)) {
    return { ok: false, status: 400, detail: "未知智能体" }
  }
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : ""
  if (!prompt) return { ok: false, status: 400, detail: "缺少任务内容" }
  if (prompt.length > MAX_PROMPT_CHARS) {
    return { ok: false, status: 400, detail: "任务内容过长" }
  }

  const evidence: EvidenceItem[] = []
  if (Array.isArray(body.evidence)) {
    for (const item of body.evidence.slice(0, MAX_EVIDENCE_ITEMS)) {
      if (!item || typeof item !== "object") continue
      const record = item as Record<string, unknown>
      const source = typeof record.source === "string" ? record.source.trim().slice(0, 300) : ""
      const text = typeof record.text === "string" ? record.text.trim() : ""
      if (!source || !text) continue
      evidence.push({ source, text: text.slice(0, MAX_EVIDENCE_CHARS) })
    }
  }
  const images: AgentImageEvidence[] = []
  if (Array.isArray(body.images)) {
    for (const item of body.images.slice(0, MAX_IMAGES)) {
      if (!item || typeof item !== "object") continue
      const record = item as Record<string, unknown>
      const mimeType = typeof record.mimeType === "string" ? record.mimeType.trim().toLowerCase() : ""
      let dataBase64 = typeof record.dataBase64 === "string" ? record.dataBase64.replace(/\s/g, "") : ""
      const embedded = /^data:image\/[^;]+;base64,(.+)$/i.exec(dataBase64)
      if (embedded) dataBase64 = embedded[1]?.replace(/\s/g, "") ?? ""
      if (!mimeType.startsWith("image/") || !dataBase64 || dataBase64.length > MAX_IMAGE_BASE64_CHARS) {
        continue
      }
      const source = typeof record.source === "string" ? record.source.trim().slice(0, 300) : "uploaded-image"
      images.push({ mimeType, dataBase64, source: source || "uploaded-image" })
    }
  }
  return {
    ok: true,
    value: {
      agentId,
      prompt,
      collaboration: body.collaboration !== false,
      evidence,
      images,
    },
  }
}
