/**
 * 全局任务运行时 — 统一任务模型
 * 与 UI 解耦：切页不卸载轮询，完成自动写历史。
 */

export type TaskKind =
  | "dh-video-v2"
  | "dh-video-economy"
  | "image-video"
  | "mashup"
  | "promo-video"
  | "copywriting-extract"

export type RuntimeTaskStatus = "running" | "success" | "failed"

export type RuntimeTask = {
  kind: TaskKind
  taskId: string
  status: RuntimeTaskStatus
  progress: number
  stageLabel: string
  error?: string
  /** 结果字段按 kind 扩展（videoUrl / text / title / frames…） */
  result?: Record<string, unknown>
  createdAt: number
  updatedAt: number
  /** 展示与历史用元数据（script、gender、source、phase…） */
  meta?: Record<string, unknown>
}

export type RegisterTaskInput = {
  kind: TaskKind
  taskId: string
  progress?: number
  stageLabel?: string
  meta?: Record<string, unknown>
  result?: Record<string, unknown>
}

export type PollOutcome =
  | {
      type: "progress"
      progress: number
      stageLabel: string
      result?: Record<string, unknown>
      meta?: Record<string, unknown>
    }
  | {
      type: "success"
      progress?: number
      stageLabel?: string
      result?: Record<string, unknown>
      meta?: Record<string, unknown>
    }
  | {
      type: "failed"
      error: string
      progress?: number
      stageLabel?: string
      result?: Record<string, unknown>
      meta?: Record<string, unknown>
    }
  | { type: "not_found"; error?: string }

export type TaskAdapter = {
  kind: TaskKind
  pollIntervalMs: number
  poll: (task: RuntimeTask) => Promise<PollOutcome>
  /** 是否写入创作历史（视频类 true，文案提取 false） */
  writeHistory: boolean
}

export type RuntimeEvent =
  | { type: "tasks-changed"; tasks: Partial<Record<TaskKind, RuntimeTask | undefined>> }
  | { type: "task-updated"; task: RuntimeTask }
  | { type: "task-terminal"; task: RuntimeTask }
  | { type: "history-updated" }

export const TASK_KIND_LABELS: Record<TaskKind, string> = {
  "dh-video-v2": "数字人口播视频（新）",
  "dh-video-economy": "数字人视频创作（经济版）",
  "image-video": "图文视频",
  mashup: "视频混剪",
  "promo-video": "宣传视频",
  "copywriting-extract": "文案提取",
}

/** 侧栏 view key → TaskKind（与 VIDEO_VIEWS / 文案提取 label 对齐） */
export const VIEW_TO_TASK_KIND: Record<string, TaskKind> = {
  "数字人视频创作（新）": "dh-video-v2",
  "数字人视频创作（经济版）": "dh-video-economy",
  图文视频: "image-video",
  视频混剪: "mashup",
  宣传视频: "promo-video",
  文案提取: "copywriting-extract",
}

export const ALL_TASK_KINDS: TaskKind[] = [
  "dh-video-v2",
  "dh-video-economy",
  "image-video",
  "mashup",
  "promo-video",
  "copywriting-extract",
]
