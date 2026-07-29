"use client"

import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import { queryVideoCoverStatus, submitVideoCover } from "@/lib/video/cover-api"
import { getTaskRuntime } from "@/lib/task-runtime/runtime"
import { writeHistoryFromTask } from "@/lib/task-runtime/history-bridge"
import type { TaskKind } from "@/lib/task-runtime/types"
import { addHistoryRecord, getHistoryRecords } from "@/lib/video/storage"
import { resolveMediaUrl } from "@/lib/video/utils"

const COVER_POLL_MS = 5000
const COVER_MAX_WAIT_MS = 10 * 60 * 1000
const COVER_SUBMIT_MAX_ATTEMPTS = 3
const COVER_SUBMIT_RETRY_DELAY_MS = 750

export type CoverReferenceImage = {
  base64?: string
  dataUrl?: string
  previewUrl?: string
  url?: string
}

export type StartCoverGenerationParams = {
  kind: TaskKind
  script: string
  referenceImage?: CoverReferenceImage | null
  aspectRatio?: CoverAspectRatio
  resolution?: CoverResolution
  linkedTaskId?: string
  /** 无参考图时静默跳过（混剪未上传封面参考图） */
  skipIfNoReference?: boolean
}

const activeCoverPolls = new Map<string, ReturnType<typeof setInterval>>()

function isTransientCoverSubmitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /客户端服务暂时无法连接|无法连接|网络|network|failed to fetch|fetch failed|load failed|超时|timeout/i.test(
    message,
  )
}

export async function retryTransientCoverSubmit<T>(
  operation: () => Promise<T>,
  options: { delayMs?: number } = {},
): Promise<T> {
  const delayMs = options.delayMs ?? COVER_SUBMIT_RETRY_DELAY_MS
  for (let attempt = 1; attempt <= COVER_SUBMIT_MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (!isTransientCoverSubmitError(error) || attempt === COVER_SUBMIT_MAX_ATTEMPTS) {
        throw error
      }
      if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
      }
    }
  }
  throw new Error("封面提交失败")
}

function coverPollKey(kind: TaskKind, linkedTaskId: string): string {
  return `${kind}:${linkedTaskId}`
}

function stripDataUrlPrefix(dataUrl: string): string {
  const trimmed = dataUrl.trim()
  if (trimmed.includes(",") && trimmed.toLowerCase().startsWith("data:")) {
    return trimmed.split(",", 2)[1] ?? ""
  }
  return trimmed
}

function resolveReferencePayload(ref?: CoverReferenceImage | null): {
  referenceImageBase64?: string
  referenceImageUrl?: string
} {
  if (!ref) return {}
  if (ref.base64?.trim()) {
    return { referenceImageBase64: stripDataUrlPrefix(ref.base64) }
  }
  if (ref.dataUrl?.trim()) {
    return { referenceImageBase64: stripDataUrlPrefix(ref.dataUrl) }
  }
  if (ref.url?.trim()) {
    return { referenceImageUrl: ref.url.trim() }
  }
  if (ref.previewUrl?.trim()) {
    const p = ref.previewUrl.trim()
    if (p.startsWith("data:")) {
      return { referenceImageBase64: stripDataUrlPrefix(p) }
    }
    if (p.startsWith("http://") || p.startsWith("https://") || p.startsWith("/")) {
      return { referenceImageUrl: resolveMediaUrl(p) }
    }
  }
  return {}
}

async function refreshHistoryCover(kind: TaskKind, linkedTaskId: string, coverUrl: string): Promise<void> {
  const rt = getTaskRuntime()
  const task = rt.getTask(kind)
  if (task?.taskId === linkedTaskId) {
    rt.patchTask(kind, {
      result: { ...task.result, coverUrl },
      meta: { ...task.meta, coverStatus: "success", coverError: "" },
    })
    const updated = rt.getTask(kind)
    if (updated?.status === "success") {
      await writeHistoryFromTask(updated)
      rt.notifyHistoryUpdated()
      return
    }
  }

  const records = getHistoryRecords()
  const record = records.find((r) => r.id === linkedTaskId)
  if (record) {
    addHistoryRecord({ ...record, coverUrl })
    rt.notifyHistoryUpdated()
  }
}

function stopCoverPoll(key: string): void {
  const timer = activeCoverPolls.get(key)
  if (timer) {
    clearInterval(timer)
    activeCoverPolls.delete(key)
  }
}

/**
 * 与视频主任务并行发起封面生成；失败不阻断视频流程。
 */
export function startCoverGeneration(params: StartCoverGenerationParams): void {
  const {
    kind,
    script,
    referenceImage,
    aspectRatio = DEFAULT_COVER_ASPECT_RATIO,
    resolution = DEFAULT_COVER_RESOLUTION,
    linkedTaskId = "",
    skipIfNoReference = false,
  } = params

  const trimmedScript = script.trim()
  if (!trimmedScript) return

  const refPayload = resolveReferencePayload(referenceImage)
  if (!refPayload.referenceImageBase64 && !refPayload.referenceImageUrl) {
    if (!skipIfNoReference) return
    return
  }

  const pollKey = coverPollKey(kind, linkedTaskId || `pending-${Date.now()}`)
  stopCoverPoll(pollKey)

  const rt = getTaskRuntime()
  if (linkedTaskId) {
    const task = rt.getTask(kind)
    if (task?.taskId === linkedTaskId) {
      rt.patchTask(kind, {
        meta: { ...task.meta, coverStatus: "running", coverError: "" },
      })
    }
  }

  void (async () => {
    try {
      const requestRef =
        globalThis.crypto?.randomUUID?.() ??
        `cover-${linkedTaskId || kind}-${Date.now()}-${Math.random().toString(16).slice(2)}`
      const { cover_task_id: coverTaskId } = await retryTransientCoverSubmit(() =>
        submitVideoCover({
          script: trimmedScript,
          referenceImageBase64: refPayload.referenceImageBase64,
          referenceImageUrl: refPayload.referenceImageUrl,
          aspectRatio,
          resolution,
          linkedTaskId,
          source: kind,
          requestRef,
        }),
      )

      const startedAt = Date.now()
      const poll = async () => {
        if (Date.now() - startedAt > COVER_MAX_WAIT_MS) {
          stopCoverPoll(pollKey)
          if (linkedTaskId) {
            const task = rt.getTask(kind)
            if (task?.taskId === linkedTaskId) {
              rt.patchTask(kind, {
                meta: { ...task.meta, coverStatus: "failed", coverError: "封面生成超时" },
              })
            }
          }
          return
        }

        try {
          const status = await queryVideoCoverStatus(coverTaskId)
          if (status.status === "success" && status.cover_url) {
            stopCoverPoll(pollKey)
            const coverUrl = resolveMediaUrl(status.cover_url)
            if (linkedTaskId) {
              await refreshHistoryCover(kind, linkedTaskId, coverUrl)
            }
            return
          }
          if (status.status === "failed") {
            stopCoverPoll(pollKey)
            if (linkedTaskId) {
              const task = rt.getTask(kind)
              if (task?.taskId === linkedTaskId) {
                rt.patchTask(kind, {
                  meta: {
                    ...task.meta,
                    coverStatus: "failed",
                    coverError: status.error || "封面生成失败",
                  },
                })
              }
            }
          }
        } catch {
          /* 轮询网络抖动时继续 */
        }
      }

      await poll()
      const timer = setInterval(() => {
        void poll()
      }, COVER_POLL_MS)
      activeCoverPolls.set(pollKey, timer)
    } catch (e) {
      if (linkedTaskId) {
        const task = rt.getTask(kind)
        if (task?.taskId === linkedTaskId) {
          rt.patchTask(kind, {
            meta: {
              ...task.meta,
              coverStatus: "failed",
              coverError: e instanceof Error ? e.message : "封面提交失败",
            },
          })
        }
      }
    }
  })()
}

/** 测试用：清理轮询定时器 */
export function stopAllCoverPollsForTests(): void {
  for (const key of activeCoverPolls.keys()) {
    stopCoverPoll(key)
  }
}
