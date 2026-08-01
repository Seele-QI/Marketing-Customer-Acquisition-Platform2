"use client"

/**
 * GEO 优化工作区入口 — 与视频创作工作区完全隔离。
 * 不共享视频任务状态、剪辑模板或 video-task-store。
 */

import { GeoKnowledgeBaseView } from "@/components/geo-knowledge-base-view"
import { GeoContentMatrixView } from "@/components/geo-content-matrix-view"
import { GeoArticleEditorView } from "@/components/geo-article-editor-view"
import { ModuleTutorialButton } from "@/components/tutorial/module-tutorial-button"
import { GEO_VIEWS, type GeoView } from "@/lib/geo/workspace"

type Props = {
  activeView: GeoView
}

function panelClass(visible: boolean): string {
  return visible ? "flex min-h-0 flex-1 flex-col" : "hidden"
}

export function GeoWorkspace({ activeView }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" data-workspace="geo">
      <div className="flex shrink-0 items-center justify-end border-b border-border/40 px-4 py-2">
        <ModuleTutorialButton view={activeView} />
      </div>
      <div
        className={panelClass(activeView === GEO_VIEWS.KNOWLEDGE_BASE)}
        aria-hidden={activeView !== GEO_VIEWS.KNOWLEDGE_BASE}
      >
        <GeoKnowledgeBaseView />
      </div>
      <div
        className={panelClass(activeView === GEO_VIEWS.CONTENT_MATRIX)}
        aria-hidden={activeView !== GEO_VIEWS.CONTENT_MATRIX}
      >
        <GeoContentMatrixView />
      </div>
      <div
        className={panelClass(activeView === GEO_VIEWS.ARTICLE_EDITOR)}
        aria-hidden={activeView !== GEO_VIEWS.ARTICLE_EDITOR}
      >
        <GeoArticleEditorView />
      </div>
    </div>
  )
}
