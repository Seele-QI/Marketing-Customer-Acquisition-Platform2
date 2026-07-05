"use client"

import * as React from "react"
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import {
  createMatrixProject,
  deleteMatrixProject,
  listMatrixProjects,
  updateMatrixProject,
} from "@/lib/geo/matrix-api"

type Props = {
  activeId: string | null
  onSelect: (project: MatrixProject | null) => void
  onProjectsChange?: (projects: MatrixProject[]) => void
  disabled?: boolean
}

export function GeoMatrixProjectBar({
  activeId,
  onSelect,
  onProjectsChange,
  disabled,
}: Props) {
  const [projects, setProjects] = React.useState<MatrixProject[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [renamingId, setRenamingId] = React.useState<string | null>(null)
  const [renameValue, setRenameValue] = React.useState("")

  const refresh = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const list = await listMatrixProjects()
      setProjects(list)
      onProjectsChange?.(list)
      if (list.length > 0 && !activeId) {
        onSelect(list[0])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载项目失败"
      setLoadError(message)
      setProjects([])
      onProjectsChange?.([])
    } finally {
      setLoading(false)
    }
  }, [activeId, onProjectsChange, onSelect])

  React.useEffect(() => {
    void refresh()
  }, [refresh])

  const handleCreate = async () => {
    setBusy(true)
    try {
      const p = await createMatrixProject(`矩阵项目 ${projects.length + 1}`)
      await refresh()
      onSelect(p)
      toast({ title: `已创建「${p.name}」` })
    } catch (err) {
      toast({
        title: "新建项目失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该项目？")) return
    setBusy(true)
    try {
      await deleteMatrixProject(id)
      const list = await listMatrixProjects()
      setProjects(list)
      onProjectsChange?.(list)
      if (activeId === id) {
        onSelect(list[0] ?? null)
      }
      toast({ title: "项目已删除" })
    } catch (err) {
      toast({
        title: "删除失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
    }
  }

  const startRename = (p: MatrixProject) => {
    setRenamingId(p.id)
    setRenameValue(p.name)
  }

  const commitRename = async () => {
    if (!renamingId) return
    const name = renameValue.trim()
    if (!name) {
      setRenamingId(null)
      return
    }
    setBusy(true)
    try {
      const updated = await updateMatrixProject(renamingId, { name })
      setProjects((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
      if (activeId === updated.id) onSelect(updated)
    } catch (err) {
      toast({
        title: "重命名失败",
        description: err instanceof Error ? err.message : "未知错误",
        variant: "destructive",
      })
    } finally {
      setBusy(false)
      setRenamingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载项目…
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {loadError && (
        <p className="rounded-lg border border-red-200/80 bg-red-50/60 px-3 py-2 text-[12px] text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
          {loadError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-1 flex-wrap items-center gap-1.5 overflow-x-auto">
          {projects.length === 0 && !loadError && (
            <span className="text-[12px] text-slate-500">暂无项目，点击新建开始规划</span>
          )}
          {projects.map((p) => {
            const active = p.id === activeId
            return (
              <div key={p.id} className="flex items-center gap-0.5">
                {renamingId === p.id ? (
                  <input
                    autoFocus
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => void commitRename()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void commitRename()
                      if (e.key === "Escape") setRenamingId(null)
                    }}
                    className="h-8 w-32 rounded-lg border border-cyan-300 px-2 text-[12px] dark:border-cyan-500/40 dark:bg-slate-900"
                  />
                ) : (
                  <button
                    type="button"
                    disabled={disabled || busy}
                    onClick={() => onSelect(p)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors",
                      active
                        ? "border-cyan-400 bg-cyan-50 text-cyan-700 dark:border-cyan-500/40 dark:bg-cyan-500/15 dark:text-cyan-300"
                        : "border-slate-200/80 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/10 dark:bg-white/5 dark:text-slate-400",
                    )}
                  >
                    {p.name}
                  </button>
                )}
                {active && renamingId !== p.id && (
                  <>
                    <button
                      type="button"
                      title="重命名"
                      disabled={busy}
                      onClick={() => startRename(p)}
                      className="rounded p-1 text-slate-400 hover:text-cyan-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      title="删除"
                      disabled={busy}
                      onClick={() => void handleDelete(p.id)}
                      className="rounded p-1 text-slate-400 hover:text-red-500"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            )
          })}
        </div>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => void handleCreate()}
          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-cyan-300 px-3 py-1.5 text-[12px] font-medium text-cyan-600 hover:bg-cyan-50 dark:border-cyan-500/30 dark:text-cyan-400 dark:hover:bg-cyan-500/10"
        >
          <Plus className="h-3.5 w-3.5" />
          新建项目
        </button>
      </div>
    </div>
  )
}
