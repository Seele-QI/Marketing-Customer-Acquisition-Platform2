/**
 * 全局任务运行时 — 注册 / 轮询 / 订阅 / 完成写历史
 * 单例，与 React 树解耦；Provider 仅负责挂载与 toast。
 */
import { dhVideoV2Adapter } from "@/lib/task-runtime/adapters/dh-video-v2"
import { dhVideoEconomyAdapter } from "@/lib/task-runtime/adapters/dh-video-economy"
import { imageVideoAdapter, mashupAdapter } from "@/lib/task-runtime/adapters/clip"
import { extractAdapter } from "@/lib/task-runtime/adapters/extract"
import { promoVideoAdapter } from "@/lib/task-runtime/adapters/promo"
import { writeHistoryFromTask } from "@/lib/task-runtime/history-bridge"
import {
  createRuntimeTask,
  loadRuntimeStore,
  saveRuntimeStore,
  type RuntimeStoreSnapshot,
} from "@/lib/task-runtime/store"
import type {
  RegisterTaskInput,
  RuntimeEvent,
  RuntimeTask,
  TaskAdapter,
  TaskKind,
} from "@/lib/task-runtime/types"
import { getTaskHardTimeoutMs } from "@/lib/task-runtime/constants"
import { ALL_TASK_KINDS } from "@/lib/task-runtime/types"

type Listener = (event: RuntimeEvent) => void

const adapters: Record<TaskKind, TaskAdapter> = {
  "dh-video-v2": dhVideoV2Adapter,
  "dh-video-economy": dhVideoEconomyAdapter,
  "image-video": imageVideoAdapter,
  mashup: mashupAdapter,
  "promo-video": promoVideoAdapter,
  "copywriting-extract": extractAdapter,
}

const POLL_ERROR_LIMIT = 8

class TaskRuntime {
  private tasks: RuntimeStoreSnapshot = {}
  private timers = new Map<TaskKind, ReturnType<typeof setTimeout>>()
  private inflight = new Set<TaskKind>()
  private pollErrors = new Map<TaskKind, number>()
  private listeners = new Set<Listener>()
  private started = false

  start(): void {
    if (!this.started) {
      this.started = true
      this.tasks = loadRuntimeStore()
    }
    this.ensureRunningTaskPolls()
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })
  }

  private ensureRunningTaskPolls(): void {
    for (const kind of ALL_TASK_KINDS) {
      const t = this.tasks[kind]
      if (
        t?.status === "running" &&
        t.taskId &&
        !this.timers.has(kind) &&
        !this.inflight.has(kind)
      ) {
        this.schedulePoll(kind, 0)
      }
    }
  }

  stop(): void {
    for (const kind of this.timers.keys()) {
      this.clearTimer(kind)
    }
    this.started = false
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getTasks(): RuntimeStoreSnapshot {
    return { ...this.tasks }
  }

  getTask(kind: TaskKind): RuntimeTask | undefined {
    return this.tasks[kind]
  }

  isRunning(kind: TaskKind): boolean {
    return this.tasks[kind]?.status === "running"
  }

  /**
   * 登记任务并开始轮询。同 kind 已有 running 时覆盖跟踪（调用方应先确认）。
   */
  register(input: RegisterTaskInput): RuntimeTask {
    this.start()
    const prev = this.tasks[input.kind]
    if (prev?.status === "running" && prev.taskId !== input.taskId) {
      this.clearTimer(input.kind)
    }

    const task = createRuntimeTask(input)
    this.tasks[input.kind] = task
    this.pollErrors.set(input.kind, 0)
    this.persist()
    this.emit({ type: "task-updated", task })
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })
    this.schedulePoll(input.kind, 0)
    return task
  }

  /** 停止跟踪（不取消后端任务） */
  abandon(kind: TaskKind): void {
    this.clearTimer(kind)
    delete this.tasks[kind]
    this.persist()
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })
  }

  /** 更新已登记任务（如进入剪辑子阶段） */
  patchTask(
    kind: TaskKind,
    patch: Partial<Pick<RuntimeTask, "progress" | "stageLabel" | "meta" | "result" | "status">>,
  ): RuntimeTask | undefined {
    const t = this.tasks[kind]
    if (!t) return undefined
    const next: RuntimeTask = {
      ...t,
      progress: patch.progress ?? t.progress,
      stageLabel: patch.stageLabel ?? t.stageLabel,
      status: patch.status ?? t.status,
      meta: patch.meta ? { ...t.meta, ...patch.meta } : t.meta,
      result: patch.result ? { ...t.result, ...patch.result } : t.result,
      updatedAt: Date.now(),
    }
    this.tasks[kind] = next
    this.persist()
    this.emit({ type: "task-updated", task: next })
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })
    if (next.status === "running") {
      this.schedulePoll(kind, 0)
    }
    return next
  }

  /** 封面等异步完成后刷新创作历史列表 */
  notifyHistoryUpdated(): void {
    this.emit({ type: "history-updated" })
  }

  /** 用户主动标记失败（如点停止） */
  markFailed(kind: TaskKind, error: string, options?: { writeHistory?: boolean }): void {
    const t = this.tasks[kind]
    if (!t) return
    this.clearTimer(kind)
    const next: RuntimeTask = {
      ...t,
      status: "failed",
      error,
      updatedAt: Date.now(),
      stageLabel: "已停止",
    }
    this.tasks[kind] = next
    this.persist()
    this.emit({ type: "task-updated", task: next })
    this.emit({ type: "task-terminal", task: next })
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })
    if (options?.writeHistory !== false && adapters[kind].writeHistory) {
      void writeHistoryFromTask(next).then(() => {
        this.emit({ type: "history-updated" })
      })
    }
  }

  private emit(event: RuntimeEvent): void {
    for (const l of this.listeners) {
      try {
        l(event)
      } catch {
        /* listener errors must not break runtime */
      }
    }
  }

  private persist(): void {
    saveRuntimeStore(this.tasks)
  }

  private clearTimer(kind: TaskKind): void {
    const id = this.timers.get(kind)
    if (id != null) {
      clearTimeout(id)
      this.timers.delete(kind)
    }
  }

  private schedulePoll(kind: TaskKind, delayMs: number): void {
    this.clearTimer(kind)
    const adapter = adapters[kind]
    const timer = setTimeout(() => {
      void this.pollOnce(kind)
    }, delayMs >= 0 ? delayMs : adapter.pollIntervalMs)
    this.timers.set(kind, timer)
  }

  private async pollOnce(kind: TaskKind): Promise<void> {
    const task = this.tasks[kind]
    if (!task || task.status !== "running") return
    if (this.inflight.has(kind)) {
      this.schedulePoll(kind, adapters[kind].pollIntervalMs)
      return
    }

    this.inflight.add(kind)
    const adapter = adapters[kind]
    try {
      const hardTimeoutMs = getTaskHardTimeoutMs(kind)
      if (
        hardTimeoutMs != null &&
        task.createdAt > 0 &&
        Date.now() - task.createdAt > hardTimeoutMs
      ) {
        await this.finalize(
          kind,
          {
            ...task,
            status: "failed",
            error: "任务超时（已超过 50 分钟）",
            stageLabel: "超时",
            updatedAt: Date.now(),
          },
          { writeHistory: adapter.writeHistory },
        )
        return
      }

      const outcome = await adapter.poll(task)
      // 任务可能在 await 期间被 abandon
      const current = this.tasks[kind]
      if (!current || current.taskId !== task.taskId || current.status !== "running") {
        return
      }

      this.pollErrors.set(kind, 0)

      if (outcome.type === "progress") {
        const next: RuntimeTask = {
          ...current,
          progress: outcome.progress,
          stageLabel: outcome.stageLabel,
          result: outcome.result ? { ...current.result, ...outcome.result } : current.result,
          meta: outcome.meta ? { ...current.meta, ...outcome.meta } : current.meta,
          updatedAt: Date.now(),
        }
        this.tasks[kind] = next
        this.persist()
        this.emit({ type: "task-updated", task: next })

        this.schedulePoll(kind, adapter.pollIntervalMs)
        return
      }

      if (outcome.type === "not_found") {
        await this.finalize(kind, {
          ...current,
          status: "failed",
          error: outcome.error || "任务已失效（服务可能已重启），请重新生成",
          stageLabel: "已失效",
          updatedAt: Date.now(),
        }, { writeHistory: false })
        return
      }

      if (outcome.type === "success") {
        const next: RuntimeTask = {
          ...current,
          status: "success",
          progress: outcome.progress ?? 100,
          stageLabel: outcome.stageLabel || "完成",
          error: undefined,
          result: outcome.result ? { ...current.result, ...outcome.result } : current.result,
          meta: outcome.meta ? { ...current.meta, ...outcome.meta } : current.meta,
          updatedAt: Date.now(),
        }
        await this.finalize(kind, next, { writeHistory: adapter.writeHistory })
        return
      }

      if (outcome.type === "failed") {
        const next: RuntimeTask = {
          ...current,
          status: "failed",
          progress: outcome.progress ?? current.progress,
          stageLabel: outcome.stageLabel || "失败",
          error: outcome.error,
          result: outcome.result ? { ...current.result, ...outcome.result } : current.result,
          meta: outcome.meta ? { ...current.meta, ...outcome.meta } : current.meta,
          updatedAt: Date.now(),
        }
        await this.finalize(kind, next, { writeHistory: adapter.writeHistory })
      }
    } catch (err) {
      const count = (this.pollErrors.get(kind) ?? 0) + 1
      this.pollErrors.set(kind, count)
      const current = this.tasks[kind]
      if (!current || current.status !== "running") return

      if (count >= POLL_ERROR_LIMIT) {
        const msg = err instanceof Error ? err.message : "轮询失败次数过多"
        await this.finalize(
          kind,
          {
            ...current,
            status: "failed",
            error: msg,
            stageLabel: "失败",
            updatedAt: Date.now(),
          },
          { writeHistory: adapter.writeHistory },
        )
        return
      }
      this.schedulePoll(kind, adapter.pollIntervalMs)
    } finally {
      this.inflight.delete(kind)
    }
  }

  private async finalize(
    kind: TaskKind,
    task: RuntimeTask,
    options: { writeHistory: boolean },
  ): Promise<void> {
    this.clearTimer(kind)
    this.tasks[kind] = task
    this.persist()
    this.emit({ type: "task-updated", task })
    this.emit({ type: "task-terminal", task })
    this.emit({ type: "tasks-changed", tasks: { ...this.tasks } })

    if (options.writeHistory) {
      try {
        await writeHistoryFromTask(task)
        this.emit({ type: "history-updated" })
      } catch {
        /* ignore history errors */
      }
    }
  }
}

/** 浏览器单例 */
let singleton: TaskRuntime | null = null

export function getTaskRuntime(): TaskRuntime {
  if (!singleton) singleton = new TaskRuntime()
  return singleton
}

/** 测试用：重置单例 */
export function resetTaskRuntimeForTests(): void {
  if (singleton) singleton.stop()
  singleton = null
}
