/**
 * 身份定位 — 上传资料 IndexedDB 持久化辅助
 */
import type { UploadedDocumentPayload } from "@/lib/ip-positioning-schema"
import type { IpPositioningFileRef } from "@/lib/ip-positioning-store"
import {
  blobToBase64,
  deleteWorkflowAsset,
  getWorkflowAsset,
  newAssetId,
  putWorkflowAsset,
} from "@/lib/workflow-asset-store"

const WORKFLOW = "ip-positioning" as const

export async function persistIpDocument(
  file: File,
): Promise<{ ref: IpPositioningFileRef; base64: string } | null> {
  const id = newAssetId("ipdoc")
  const result = await putWorkflowAsset({
    id,
    workflow: WORKFLOW,
    name: file.name,
    mime: file.type || "application/octet-stream",
    kind: "document",
    blob: file,
  })
  if (!result.ok) return null
  const base64 = await blobToBase64(file)
  return {
    ref: { id, name: file.name, mime: file.type || "application/octet-stream", size: file.size },
    base64,
  }
}

export async function hydrateIpDocuments(
  refs: IpPositioningFileRef[],
): Promise<UploadedDocumentPayload[]> {
  const out: UploadedDocumentPayload[] = []
  for (const ref of refs) {
    const row = await getWorkflowAsset(ref.id)
    if (!row) continue
    const base64 = await blobToBase64(row.blob)
    out.push({ name: ref.name, size: ref.size, type: ref.mime, base64 })
  }
  return out
}

export async function removeIpDocument(id: string): Promise<void> {
  await deleteWorkflowAsset(id)
}
