"use client"

import * as React from "react"
import { LogIn } from "lucide-react"
import { GeoWorkflowHero, GeoWorkflowPage } from "@/components/geo/geo-workflow-shell"
import { GeoMatrixProjectBar } from "@/components/geo/matrix/geo-matrix-project-bar"
import { GeoMatrixSkillBanner } from "@/components/geo/matrix/geo-matrix-skill-banner"
import { GeoMatrixConfigPanel } from "@/components/geo/matrix/geo-matrix-config-panel"
import { GeoMatrixPlatformTabs } from "@/components/geo/matrix/geo-matrix-platform-tabs"
import { GeoMatrixGrid } from "@/components/geo/matrix/geo-matrix-grid"
import { GeoMatrixCellDrawer } from "@/components/geo/matrix/geo-matrix-cell-drawer"
import type { MatrixCell, MatrixProject } from "@/lib/geo/matrix-types"
import { DEFAULT_MATRIX_PLATFORM_IDS, getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import { generateMatrixProject, updateMatrixProject } from "@/lib/geo/matrix-api"
import { getEnterpriseSkillEntry } from "@/lib/geo/skills-registry"
import { useLoginRequired } from "@/components/auth/login-required-provider"

export function GeoContentMatrixView() {
  const { me, loggedIn, authUnavailable, refreshAuth, promptLogin } = useLoginRequired()
  const authLoading = me === undefined
  const [project, setProject] = React.useState<MatrixProject | null>(null)
  const [platforms, setPlatforms] = React.useState<string[]>(DEFAULT_MATRIX_PLATFORM_IDS)
  const [activePlatform, setActivePlatform] = React.useState<string | null>(null)
  const [provider, setProvider] = React.useState<LlmProviderId>("deepseek")
  const [modelSkillId, setModelSkillId] = React.useState<string | null>(null)
  const [viralSkillIds, setViralSkillIds] = React.useState<string[]>([])
  const [enterpriseSkillId, setEnterpriseSkillId] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [generated, setGenerated] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [selectedCell, setSelectedCell] = React.useState<MatrixCell | null>(null)
  const [drawerOpen, setDrawerOpen] = React.useState(false)
  const [cellSaving, setCellSaving] = React.useState(false)

  const syncFromProject = React.useCallback((p: MatrixProject) => {
    setProject(p)
    setPlatforms(p.platforms?.length ? p.platforms : DEFAULT_MATRIX_PLATFORM_IDS)
    setModelSkillId(p.modelSkillId)
    setViralSkillIds(p.viralSkillIds ?? [])
    setEnterpriseSkillId(p.enterpriseSkillId)
    setProvider((p.provider as LlmProviderId) || "deepseek")
    setGenerated(Boolean(p.matrix?.platforms?.length))
    const first = p.platforms?.[0] ?? p.matrix?.platforms?.[0]?.platformId ?? null
    setActivePlatform(first)
  }, [])

  const activeCells = React.useMemo(() => {
    if (!project?.matrix?.platforms || !activePlatform) return []
    return (
      project.matrix.platforms.find((pm) => pm.platformId === activePlatform)?.cells ?? []
    )
  }, [project, activePlatform])

  const handleGenerate = async () => {
    if (!project) return
    setGenerating(true)
    setError(null)
    try {
      const ent = getEnterpriseSkillEntry(enterpriseSkillId)
      const updated = await generateMatrixProject(project.id, {
        provider,
        platforms,
        modelSkillId,
        viralSkillIds,
        enterpriseSkillId,
        enterpriseSnapshot: ent?.content ?? null,
      })
      syncFromProject(updated)
      setGenerated(true)
      if (platforms[0]) setActivePlatform(platforms[0])
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const handleProjectSelect = (p: MatrixProject | null) => {
    if (!p) {
      setProject(null)
      return
    }
    syncFromProject(p)
  }

  const handleCellSave = async (updated: MatrixCell) => {
    if (!project || !activePlatform) return
    setCellSaving(true)
    setError(null)
    try {
      const matrixPlatforms = (project.matrix?.platforms ?? []).map((pm) => {
        if (pm.platformId !== activePlatform) return pm
        return {
          ...pm,
          cells: pm.cells.map((c) =>
            c.date === updated.date && c.title === updated.title ? updated : c,
          ),
        }
      })
      const updatedProject = await updateMatrixProject(project.id, {
        matrix: { ...project.matrix, platforms: matrixPlatforms },
      })
      syncFromProject(updatedProject)
      setSelectedCell(updated)
    } catch (e) {
      setError(e instanceof Error ? e.message : "保存失败")
    } finally {
      setCellSaving(false)
    }
  }

  React.useEffect(() => {
    if (!project || !loggedIn) return
    const ent = getEnterpriseSkillEntry(enterpriseSkillId)
    const t = window.setTimeout(() => {
      void updateMatrixProject(project.id, {
        platforms,
        modelSkillId,
        viralSkillIds,
        enterpriseSkillId,
        provider,
        ...(enterpriseSkillId
          ? { enterpriseSnapshot: ent?.content ?? null }
          : { clearEnterpriseSnapshot: true }),
      }).catch(() => {})
    }, 800)
    return () => window.clearTimeout(t)
  }, [
    project,
    loggedIn,
    platforms,
    modelSkillId,
    viralSkillIds,
    enterpriseSkillId,
    provider,
  ])

  return (
    <GeoWorkflowPage>
      <GeoWorkflowHero
        title="内容"
        accentWord="矩阵规划"
        description="多项目两周 Sprint：选平台、配 AI 引擎与企业知识库，一键生成跨平台关联内容矩阵。"
      />

      {authUnavailable && !authLoading && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200/80 bg-red-50/60 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <LogIn className="h-5 w-5 shrink-0 text-red-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-red-900 dark:text-red-200">无法连接云端服务</p>
            <p className="text-[12px] text-red-800/80 dark:text-red-300/80">
              暂时无法确认登录状态，请检查网络或 CLOUD_API_URL 配置后重试。
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refreshAuth()}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-red-700"
          >
            重试
          </button>
        </div>
      )}

      {!authLoading && !loggedIn && !authUnavailable && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <LogIn className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-amber-900 dark:text-amber-200">请先登录</p>
            <p className="text-[12px] text-amber-800/80 dark:text-amber-300/80">
              内容矩阵项目保存在服务端，需登录后创建与管理多项目。
            </p>
          </div>
          <button
            type="button"
            onClick={() => promptLogin("登录后可创建与管理内容矩阵项目")}
            className="shrink-0 rounded-lg bg-amber-600 px-3 py-1.5 text-[12px] font-medium text-white hover:bg-amber-700"
          >
            去登录
          </button>
        </div>
      )}

      {loggedIn && (
        <div className="mb-4">
          <GeoMatrixProjectBar
            activeId={project?.id ?? null}
            onSelect={handleProjectSelect}
            disabled={generating}
          />
        </div>
      )}

      <GeoMatrixSkillBanner generated={generated} className="mb-4" />

      {loggedIn && !project && (
        <p className="mb-4 rounded-xl border border-slate-200/80 bg-slate-50/60 px-4 py-3 text-[13px] text-slate-600 dark:border-white/10 dark:bg-white/[0.03] dark:text-slate-400">
          请先新建或选择一个矩阵项目，再配置平台与 AI 引擎。
        </p>
      )}

      {loggedIn && project && (
        <>
          <GeoMatrixConfigPanel
            selectedPlatforms={platforms}
            onPlatformsChange={setPlatforms}
            provider={provider}
            onProviderChange={setProvider}
            modelSkillId={modelSkillId}
            onModelChange={setModelSkillId}
            viralSkillIds={viralSkillIds}
            onViralChange={setViralSkillIds}
            enterpriseSkillId={enterpriseSkillId}
            onEnterpriseChange={setEnterpriseSkillId}
            onGenerate={() => void handleGenerate()}
            generating={generating}
          />

          {error && (
            <p className="mt-3 text-[12px] text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="mt-6 space-y-4">
            <GeoMatrixPlatformTabs
              platformIds={platforms}
              activeId={activePlatform}
              onChange={setActivePlatform}
            />
            {activePlatform && (
              <GeoMatrixGrid
                platformId={activePlatform}
                cells={activeCells}
                empty={!generated}
                onCellClick={(cell) => {
                  setSelectedCell(cell)
                  setDrawerOpen(true)
                }}
              />
            )}
          </div>
        </>
      )}

      <GeoMatrixCellDrawer
        cell={selectedCell}
        platformLabel={activePlatform ? getMatrixPlatformLabel(activePlatform) : ""}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onCellSave={(cell) => void handleCellSave(cell)}
        saving={cellSaving}
      />
    </GeoWorkflowPage>
  )
}
