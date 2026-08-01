import type { GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import type { GeoEntityData } from "@/lib/geo/entity-types"
import type { EnterpriseSkill } from "@/lib/geo/enterprise-skills-store"

export async function generateEnterpriseSkill(
  input: {
    skillName: string
    entity: GeoEntityData
    documents: Pick<GeoUploadedDoc, "name" | "text">[]
  },
  fetchImpl: typeof fetch = fetch,
): Promise<EnterpriseSkill> {
  const response = await fetchImpl("/api/geo/enterprise-skill/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  const data = await response.json().catch(() => ({})) as {
    skill?: EnterpriseSkill
    error?: string
    detail?: { message?: string } | string
  }
  const detail = typeof data.detail === "string" ? data.detail : data.detail?.message
  if (!response.ok) {
    if (response.status === 401) throw new Error("请先登录后再生成 Skill")
    if (response.status === 402) throw new Error(data.error || detail || "积分不足")
    throw new Error(data.error || detail || "企业知识库生成失败")
  }
  if (!data.skill) throw new Error("服务端未返回企业知识库 Skill")
  return data.skill
}
