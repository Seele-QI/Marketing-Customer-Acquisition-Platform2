/**
 * 全局任务运行时 — localStorage 持久化
 * 每种 kind 最多保留 1 条任务快照（进行中或最近完成）。
 */
import type { RuntimeTask, TaskKind } from "@/lib/task-runtime/types"
import { ALL_TASK_KINDS } from "@/lib/task-runtime/types"

export const RUNTIME_STORAGE_KEY = "agenthub-runtime-tasks"

export type RuntimeStoreSnapshot = Partial<Record<TaskKind, RuntimeTask>>

export function loadRuntimeStore(): RuntimeStoreSnapshot {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(RUNTIME_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as RuntimeStoreSnapshot
    const out: RuntimeStoreSnapshot = {}
    for (const kind of ALL_TASK_KINDS) {
      const t = parsed[kind]
      if (t && typeof t.taskId === "string" && t.taskId) {
        out[kind] = sanitizeTask(t, kind)
      }
    }
    return out
  } catch {
    return {}
  }
}

export function saveRuntimeStore(snapshot: RuntimeStoreSnapshot): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(RUNTIME_STORAGE_KEY, JSON.stringify(snapshot))
  } catch {
    /* quota exceeded — silent */
  }
}

export function clearRuntimeTask(kind: TaskKind): RuntimeStoreSnapshot {
  const snap = loadRuntimeStore()
  delete snap[kind]
  saveRuntimeStore(snap)
  return snap
}

function sanitizeTask(t: RuntimeTask, kind: TaskKind): RuntimeTask {
  return {
    kind,
    taskId: String(t.taskId),
    status: t.status === "success" || t.status === "failed" ? t.status : "running",
    progress: typeof t.progress === "number" ? Math.max(0, Math.min(100, t.progress)) : 0,
    stageLabel: typeof t.stageLabel === "string" ? t.stageLabel : "",
    error: typeof t.error === "string" ? t.error : undefined,
    result: t.result && typeof t.result === "object" ? t.result : undefined,
    createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
    updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
    meta: t.meta && typeof t.meta === "object" ? t.meta : undefined,
  }
}

export function createRuntimeTask(input: {
  kind: TaskKind
  taskId: string
  progress?: number
  stageLabel?: string
  meta?: Record<string, unknown>
  result?: Record<string, unknown>
}): RuntimeTask {
  const now = Date.now()
  return {
    kind: input.kind,
    taskId: input.taskId,
    status: "running",
    progress: input.progress ?? 0,
    stageLabel: input.stageLabel ?? "处理中",
    meta: input.meta,
    result: input.result,
    createdAt: now,
    updatedAt: now,
  }
}
