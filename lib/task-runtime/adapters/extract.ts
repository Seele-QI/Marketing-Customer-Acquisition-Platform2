/**
 * 文案提取轮询适配器（不写创作历史）
 */
import { queryExtractStatus } from "@/lib/video/api"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

/** 后端 progress 长时间不变时，每 15s 微增 1%，上限 95 */
function withFakeProgress(task: RuntimeTask, backendProgress: number): number {
  const startedAt =
    typeof task.meta?.startedAt === "number" ? task.meta.startedAt : task.updatedAt || Date.now()
  const elapsed = Date.now() - startedAt
  const bump = Math.floor(elapsed / 15_000)
  return Math.min(95, Math.max(backendProgress, backendProgress + bump))
}

export const extractAdapter: TaskAdapter = {
  kind: "copywriting-extract",
  pollIntervalMs: 2_000,
  writeHistory: false,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    try {
      const data = await queryExtractStatus(task.taskId)
      const rawProgress = typeof data.progress === "number" ? data.progress : task.progress
      const progress = withFakeProgress(task, rawProgress)
      const stageLabel = data.step || task.stageLabel

      if (data.status === "completed") {
        return {
          type: "success",
          progress: progress || 100,
          stageLabel: stageLabel || "完成",
          result: {
            text: data.text || "",
            title: data.title || "",
            duration: data.duration,
            source: data.source,
          },
        }
      }

      if (data.status === "failed") {
        return {
          type: "failed",
          error: data.error || "提取失败，请检查视频链接或重试",
          progress,
          stageLabel,
        }
      }

      return {
        type: "progress",
        progress,
        stageLabel: stageLabel || (data.status === "transcribing" ? "识别中" : "下载中"),
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (/404|未找到|NOT_FOUND|TASK_NOT_FOUND/i.test(msg)) {
        return { type: "not_found", error: msg }
      }
      throw err
    }
  },
}
