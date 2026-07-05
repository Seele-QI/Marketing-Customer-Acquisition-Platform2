"use client"

import * as React from "react"
import { getTaskRuntime } from "@/lib/task-runtime/runtime"
import type { RegisterTaskInput, RuntimeTask, TaskKind } from "@/lib/task-runtime/types"
import type { RuntimeStoreSnapshot } from "@/lib/task-runtime/store"

export function useRuntimeTasks(): RuntimeStoreSnapshot {
  const [tasks, setTasks] = React.useState<RuntimeStoreSnapshot>(() =>
    typeof window === "undefined" ? {} : getTaskRuntime().getTasks(),
  )

  React.useEffect(() => {
    const rt = getTaskRuntime()
    rt.start()
    setTasks(rt.getTasks())
    return rt.subscribe((ev) => {
      if (ev.type === "tasks-changed" || ev.type === "task-updated" || ev.type === "task-terminal") {
        setTasks(rt.getTasks())
      }
    })
  }, [])

  return tasks
}

export function useRuntimeTask(kind: TaskKind): RuntimeTask | undefined {
  const tasks = useRuntimeTasks()
  return tasks[kind]
}

export function useTaskRuntimeApi() {
  return React.useMemo(
    () => ({
      register: (input: RegisterTaskInput) => getTaskRuntime().register(input),
      abandon: (kind: TaskKind) => getTaskRuntime().abandon(kind),
      markFailed: (kind: TaskKind, error: string, options?: { writeHistory?: boolean }) =>
        getTaskRuntime().markFailed(kind, error, options),
      isRunning: (kind: TaskKind) => getTaskRuntime().isRunning(kind),
      getTask: (kind: TaskKind) => getTaskRuntime().getTask(kind),
      patchTask: (
        kind: TaskKind,
        patch: Partial<Pick<RuntimeTask, "progress" | "stageLabel" | "meta" | "result" | "status">>,
      ) => getTaskRuntime().patchTask(kind, patch),
    }),
    [],
  )
}

/** 订阅创作历史更新（同页完成时刷新列表） */
export function useHistoryUpdated(onUpdate: () => void): void {
  const cb = React.useRef(onUpdate)
  cb.current = onUpdate
  React.useEffect(() => {
    const rt = getTaskRuntime()
    rt.start()
    return rt.subscribe((ev) => {
      if (ev.type === "history-updated") cb.current()
    })
  }, [])
}
