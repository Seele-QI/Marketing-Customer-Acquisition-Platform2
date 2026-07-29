/**
 * 视频类任务完成 → 创作历史 localStorage
 */
import { addHistoryRecord, addShareVideo } from "@/lib/video/storage"
import type { HistoryRecord, HistoryVideoSource } from "@/lib/video/types"
import { createImageThumbnail } from "@/lib/video/utils"
import type { RuntimeTask, TaskKind } from "@/lib/task-runtime/types"

const VIDEO_KINDS: TaskKind[] = ["dh-video-v2", "dh-video-economy", "image-video", "mashup", "promo-video"]

export function kindWritesHistory(kind: TaskKind): boolean {
  return VIDEO_KINDS.includes(kind)
}

export async function writeHistoryFromTask(task: RuntimeTask): Promise<void> {
  if (!kindWritesHistory(task.kind)) return

  const source = task.kind as HistoryVideoSource
  const script = String(task.meta?.script ?? "")
  const videoUrl = String(task.result?.videoUrl ?? "")
  const coverUrl = String(task.result?.coverUrl ?? "")
  // 宣传视频分镜阶段等中间成功态：无视频 URL 则不写历史
  if (task.status === "success" && !videoUrl) return
  if (task.status === "failed" && !videoUrl) return
  if (task.meta?.skipHistory === true) return
  const gender = task.meta?.gender === "female" ? "female" : task.meta?.gender === "male" ? "male" : undefined
  const previewForThumb = typeof task.meta?.previewUrl === "string" ? task.meta.previewUrl : ""

  let coverThumbnail: string | undefined
  if (!coverUrl && previewForThumb) {
    try {
      coverThumbnail = await createImageThumbnail(previewForThumb)
    } catch {
      /* ignore */
    }
  }

  const record: HistoryRecord = {
    id: task.taskId,
    createdAt: task.createdAt || Date.now(),
    script,
    videoUrl: task.status === "success" ? videoUrl : videoUrl || "",
    coverUrl: task.status === "success" ? coverUrl : "",
    coverThumbnail,
    gender: source === "digital-human" ? gender : undefined,
    source,
    status: task.status === "success" ? "success" : "failed",
    errorMessage: task.status === "failed" ? task.error : undefined,
  }

  addHistoryRecord(record)

  if (task.status === "success" && videoUrl && (source === "dh-video-v2" || source === "dh-video-economy")) {
    addShareVideo({
      id: task.taskId,
      title: script.trim().slice(0, 30) || "数字人口播视频",
      url: videoUrl,
      thumbnail: coverUrl || coverThumbnail || undefined,
      source: "video-creation",
      createdAt: Date.now(),
    })
  }
}
