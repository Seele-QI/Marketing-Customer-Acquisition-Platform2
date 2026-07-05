"use client"

import * as React from "react"
import { CheckCircle2, Circle } from "lucide-react"
import { cn } from "@/lib/utils"
import { GeoEntityPanel, type GeoEntityData } from "@/components/geo/geo-entity-panel"
import { GeoDocUploadPanel, type GeoUploadedDoc } from "@/components/geo/geo-doc-upload-panel"
import { GeoSkillGeneratorPanel } from "@/components/geo/geo-skill-generator-panel"
import { GeoWorkflowHero, GeoWorkflowPage } from "@/components/geo/geo-workflow-shell"
import { listEnterpriseSkills } from "@/lib/geo/enterprise-skills-store"

function entityComplete(entity: GeoEntityData | null): boolean {
  if (!entity) return false
  return Boolean(
    entity.companyName.trim() &&
      entity.industry.trim() &&
      entity.coreProduct.trim(),
  )
}

export function GeoKnowledgeBaseView() {
  const [entity, setEntity] = React.useState<GeoEntityData | null>(null)
  const [docs, setDocs] = React.useState<GeoUploadedDoc[]>([])
  const [skillCount, setSkillCount] = React.useState(0)

  React.useEffect(() => {
    const refresh = () => setSkillCount(listEnterpriseSkills().length)
    refresh()
    window.addEventListener("storage", refresh)
    window.addEventListener("geo-enterprise-skills-changed", refresh)
    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener("geo-enterprise-skills-changed", refresh)
    }
  }, [])

  const healthItems = [
    {
      id: "entity",
      label: "实体完整",
      desc: "品牌名、行业、核心产品已填写",
      done: entityComplete(entity),
    },
    {
      id: "docs",
      label: "文档已入库",
      desc: "至少一份 .txt / .md 资料",
      done: docs.length > 0,
    },
    {
      id: "skill",
      label: "Skill 就绪",
      desc: "已生成并保存企业知识库 Skill",
      done: skillCount > 0,
    },
  ] as const

  return (
    <GeoWorkflowPage>
      <div className="mx-auto max-w-5xl">
        <GeoWorkflowHero
          title="企业"
          accentWord="知识库搭建"
          description="建立品牌实体模型，上传企业资料，生成可在内容矩阵与深度文章中引用的 C 层知识库 Skill。"
        />

        <div className="grid gap-4 lg:grid-cols-2">
          <GeoEntityPanel
            onChange={setEntity}
            className="rounded-xl border-slate-200/80 shadow-none"
          />
          <GeoDocUploadPanel docs={docs} onChange={setDocs} />
        </div>

        <div className="mt-4">
          <GeoSkillGeneratorPanel
            entity={entity}
            documents={docs}
            className="shadow-none"
          />
        </div>

        <div className="mt-6 rounded-xl border border-slate-200/80 bg-white p-4 dark:border-white/10 dark:bg-white/[0.03]">
          <h3 className="mb-3 text-[14px] font-semibold text-slate-800 dark:text-slate-200">
            知识库健康度
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {healthItems.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3",
                  item.done
                    ? "border-emerald-200/80 bg-emerald-50/40 dark:border-emerald-500/30 dark:bg-emerald-500/10"
                    : "border-slate-100 bg-slate-50/50 dark:border-white/5 dark:bg-white/[0.02]",
                )}
              >
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
                )}
                <div>
                  <p className="text-[13px] font-medium text-slate-800 dark:text-slate-200">
                    {item.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </GeoWorkflowPage>
  )
}
