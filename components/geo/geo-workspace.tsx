"use client"

/**
 * GEO 优化工作区入口 — 与视频创作工作区完全隔离。
 * 不共享视频任务状态、剪辑模板或 video-task-store。
 */

import { GeoKnowledgeBaseView } from "@/components/geo-knowledge-base-view"
import { GeoContentMatrixView } from "@/components/geo-content-matrix-view"
import { GeoArticleEditorView } from "@/components/geo-article-editor-view"
import { GEO_VIEWS, type GeoView } from "@/lib/geo/workspace"

type Props = {
  activeView: GeoView
}

export function GeoWorkspace({ activeView }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-workspace="geo">
      {activeView === GEO_VIEWS.KNOWLEDGE_BASE ? <GeoKnowledgeBaseView /> : null}
      {activeView === GEO_VIEWS.CONTENT_MATRIX ? <GeoContentMatrixView /> : null}
      {activeView === GEO_VIEWS.ARTICLE_EDITOR ? <GeoArticleEditorView /> : null}
    </div>
  )
}
