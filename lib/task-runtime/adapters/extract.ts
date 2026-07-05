/**
 * 文案提取轮询适配器（不写创作历史）
 */
import { queryExtractStatus } from "@/lib/video/api"
import type { PollOutcome, RuntimeTask, TaskAdapter } from "@/lib/task-runtime/types"

export const extractAdapter: TaskAdapter = {
  kind: "copywriting-extract",
  pollIntervalMs: 2_000,
  writeHistory: false,
  async poll(task: RuntimeTask): Promise<PollOutcome> {
    try {
      const data = await queryExtractStatus(task.taskId)
      const progress = typeof data.progress === "number" ? data.progress : task.progress
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
