"use client"

import * as React from "react"
import { GeoKnowledgeWizard } from "@/components/geo/knowledge/geo-knowledge-wizard"
import { GeoSavedSkillsPanel } from "@/components/geo/knowledge/geo-saved-skills-panel"
import { GeoWorkflowHero, GeoWorkflowPage } from "@/components/geo/geo-workflow-shell"

export function GeoKnowledgeBaseView() {
  const [refreshToken, setRefreshToken] = React.useState(0)
  return (
    <GeoWorkflowPage>
      <div className="mx-auto max-w-6xl" data-tutorial-id="geo-knowledge-view">
        <GeoWorkflowHero
          title="企业"
          accentWord="知识库搭建"
          description="上传已有资料，系统自动整理企业事实；您只需完成少量确认，即可生成供内容矩阵与文章创作按需引用的 C 层知识库 Skill。"
        />
        <GeoKnowledgeWizard onSaved={() => setRefreshToken((value) => value + 1)} />
        <GeoSavedSkillsPanel refreshToken={refreshToken} />
      </div>
    </GeoWorkflowPage>
  )
}
