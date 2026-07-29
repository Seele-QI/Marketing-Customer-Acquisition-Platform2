import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import type {
  ImageAspectRatio,
  ImageResolution,
  ImageWorkbenchMode,
  ImageWorkbenchStatusResponse,
  ReferenceMode,
  WorkbenchReferenceImage,
} from "@/lib/image-workbench/types"

export type SubmitImageWorkbenchInput = {
  mode: ImageWorkbenchMode
  prompt: string
  aspectRatio: ImageAspectRatio
  resolution: ImageResolution
  referenceImages: WorkbenchReferenceImage[]
  referenceMode?: ReferenceMode
}

type ImageWorkbenchPollOptions = {
  fetcher?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (error: unknown, attempt: number, delayMs: number) => void
}

class ImageWorkbenchStatusError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "ImageWorkbenchStatusError"
    this.status = status
  }
}

class ImageWorkbenchTaskFailedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ImageWorkbenchTaskFailedError"
  }
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>
  } catch {
    return {}
  }
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"))
      return
    }
    const timer = setTimeout(resolve, milliseconds)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new DOMException("Aborted", "AbortError"))
      },
      { once: true },
    )
  })
}

export async function submitImageWorkbenchTask(
  input: SubmitImageWorkbenchInput,
  fetcher: typeof fetch = fetch,
): Promise<{ task_id: string }> {
  const response = await fetcher("/api/image-workbench/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      mode: input.mode,
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      count: 2,
      ...(input.referenceImages.length && input.referenceMode
        ? { reference_mode: input.referenceMode }
        : {}),
      reference_images: input.referenceImages.map((image) => ({
        role: image.role,
        mime_type: image.mimeType,
        data_base64: image.dataBase64,
      })),
    }),
  })
  const data = await readJson(response)
  if (!response.ok) {
    throw new Error(parseApiErrorResponse(response.status, data, "图片任务提交失败"))
  }
  const taskId = typeof data.task_id === "string" ? data.task_id : ""
  if (!taskId) throw new Error("图片任务提交未返回任务 ID")
  return { task_id: taskId }
}

export async function queryImageWorkbenchStatus(
  taskId: string,
  fetcher: typeof fetch = fetch,
  signal?: AbortSignal,
): Promise<ImageWorkbenchStatusResponse> {
  const response = await fetcher(
    `/api/image-workbench/status?taskId=${encodeURIComponent(taskId)}`,
    { cache: "no-store", signal },
  )
  const data = await readJson(response)
  if (!response.ok) {
    throw new ImageWorkbenchStatusError(
      parseApiErrorResponse(response.status, data, "图片状态查询失败"),
      response.status,
    )
  }
  return data as ImageWorkbenchStatusResponse
}

export async function waitForImageWorkbenchResult(
  taskId: string,
  options: ImageWorkbenchPollOptions = {},
): Promise<ImageWorkbenchStatusResponse> {
  const fetcher = options.fetcher ?? fetch
  const intervalMs = options.intervalMs ?? 2_000
  const timeoutMs = options.timeoutMs ?? 10 * 60_000
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? abortableDelay
  const startedAt = now()
  let consecutiveErrors = 0

  while (now() - startedAt <= timeoutMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    try {
      const status = await queryImageWorkbenchStatus(taskId, fetcher, options.signal)
      consecutiveErrors = 0
      if (status.status === "success") return status
      if (status.status === "failed") {
        throw new ImageWorkbenchTaskFailedError(status.error || "图片生成失败")
      }
      await sleep(intervalMs, options.signal)
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error
      if (error instanceof ImageWorkbenchTaskFailedError) throw error
      if (
        error instanceof ImageWorkbenchStatusError
        && error.status >= 400
        && error.status < 500
        && ![408, 429].includes(error.status)
      ) {
        throw error
      }
      consecutiveErrors += 1
      const retryDelayMs = Math.min(30_000, intervalMs * (2 ** Math.min(consecutiveErrors, 4)))
      options.onRetry?.(error, consecutiveErrors, retryDelayMs)
      await sleep(retryDelayMs, options.signal)
    }
  }

  throw new Error("图片生成等待超时，任务仍可能在后台继续")
}
