import assert from "node:assert/strict"
import test from "node:test"

import {
  buildReadyAttachmentPayload,
  validateAgentAttachmentFiles,
  type AgentAttachment,
} from "../lib/agents/attachments.ts"

function fakeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type })
}

test("attachment validation independently accepts supported images and documents", () => {
  const result = validateAgentAttachmentFiles([
    fakeFile("brief.pdf", "application/pdf", 10),
    fakeFile("budget.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 10),
    fakeFile("cover.png", "image/png", 10),
    fakeFile("legacy.doc", "application/msword", 10),
  ])
  assert.deepEqual(result.accepted.map((file) => file.name), ["brief.pdf", "budget.xlsx", "cover.png"])
  assert.equal(result.rejected.length, 1)
  assert.match(result.rejected[0]?.reason ?? "", /不支持/)
})

test("attachment validation enforces independent image, document, and byte limits", () => {
  const files = [
    ...Array.from({ length: 7 }, (_, i) => fakeFile(`${i}.png`, "image/png", 1)),
    ...Array.from({ length: 6 }, (_, i) => fakeFile(`${i}.txt`, "text/plain", 1)),
    fakeFile("large.pdf", "application/pdf", 20 * 1024 * 1024 + 1),
  ]
  const result = validateAgentAttachmentFiles(files)
  assert.equal(result.accepted.filter((file) => file.type.startsWith("image/")).length, 6)
  assert.equal(result.accepted.filter((file) => !file.type.startsWith("image/")).length, 5)
  assert.ok(result.rejected.length >= 3)
})

test("only ready attachments enter the model request", () => {
  const attachments: AgentAttachment[] = [
    {
      id: "doc-ready",
      kind: "document",
      scope: "department",
      status: "ready",
      name: "policy.pdf",
      type: "application/pdf",
      size: 100,
      extractedText: "制度正文",
    },
    {
      id: "doc-failed",
      kind: "document",
      scope: "temporary",
      status: "failed",
      name: "bad.pdf",
      type: "application/pdf",
      size: 100,
      error: "corrupt",
    },
    {
      id: "image-ready",
      kind: "image",
      scope: "temporary",
      status: "ready",
      name: "chart.png",
      type: "image/png",
      size: 100,
      dataBase64: "aW1hZ2U=",
    },
  ]
  assert.deepEqual(buildReadyAttachmentPayload(attachments), {
    evidence: [{ source: "department:policy.pdf", text: "制度正文" }],
    images: [{ mimeType: "image/png", dataBase64: "aW1hZ2U=", source: "temporary:chart.png" }],
  })
})
