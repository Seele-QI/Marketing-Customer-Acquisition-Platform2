import type { GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import type { EnterpriseDocumentRef } from "@/lib/geo/enterprise-wizard-store"
import {
  deleteWorkflowAsset,
  getWorkflowAsset,
  newAssetId,
  putWorkflowAsset,
} from "@/lib/workflow-asset-store"

const WORKFLOW = "geo-enterprise" as const

export async function persistEnterpriseDocument(doc: GeoUploadedDoc, accountScope: string): Promise<EnterpriseDocumentRef> {
  const id = newAssetId(`entdoc-${accountScope.replace(/[^a-zA-Z0-9_-]/g, "_")}`)
  const blob = new Blob([doc.text], { type: "text/plain;charset=utf-8" })
  const result = await putWorkflowAsset({
    id,
    workflow: WORKFLOW,
    name: doc.name,
    mime: blob.type,
    kind: "document",
    meta: JSON.stringify({ originalSize: doc.size, accountScope }),
    blob,
  })
  if (!result.ok) throw new Error(result.reason === "quota" ? "企业资料存储空间不足" : "企业资料保存失败")
  return { id, name: doc.name, mime: blob.type, size: doc.size }
}

function belongsToAccount(meta: string | undefined, accountScope: string): boolean {
  try { return JSON.parse(meta ?? "{}").accountScope === accountScope } catch { return false }
}

export async function hydrateEnterpriseDocuments(refs: EnterpriseDocumentRef[], accountScope: string): Promise<GeoUploadedDoc[]> {
  const documents: GeoUploadedDoc[] = []
  for (const ref of refs) {
    const asset = await getWorkflowAsset(ref.id)
    if (!asset || !belongsToAccount(asset.meta, accountScope)) continue
    const text = await asset.blob.text()
    documents.push({ name: ref.name, size: ref.size, text, preview: text.replace(/\s+/g, " ").trim().slice(0, 120) })
  }
  return documents
}

export async function removeEnterpriseDocument(id: string, accountScope: string): Promise<void> {
  const asset = await getWorkflowAsset(id)
  if (asset && belongsToAccount(asset.meta, accountScope)) await deleteWorkflowAsset(id)
}
