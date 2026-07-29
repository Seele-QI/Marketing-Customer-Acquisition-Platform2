import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import type {
  PosterAspectRatio,
  PosterResolution,
  PosterStatusResponse,
} from "@/lib/poster/types"

export type SubmitPosterGenerationInput = {
  prompt: string
  aspectRatio: PosterAspectRatio
  resolution: PosterResolution
  count?: 2
}

type PosterPollOptions = {
  fetcher?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  now?: () => number
  sleep?: (milliseconds: number, signal?: AbortSignal) => Promise<void>
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

export async function submitPosterGeneration(
  input: SubmitPosterGenerationInput,
  fetcher: typeof fetch = fetch,
): Promise<{ poster_task_id: string }> {
  const response = await fetcher("/api/poster/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio,
      resolution: input.resolution,
      count: input.count ?? 2,
    }),
  })
  const data = await readJson(response)
  if (!response.ok) {
    throw new Error(parseApiErrorResponse(response.status, data, "海报提交失败"))
  }
  const posterTaskId =
    typeof data.poster_task_id === "string" ? data.poster_task_id : ""
  if (!posterTaskId) {
    throw new Error("海报提交未返回任务 ID")
  }
  return { poster_task_id: posterTaskId }
}

export async function queryPosterStatus(
  posterTaskId: string,
  fetcher: typeof fetch = fetch,
): Promise<PosterStatusResponse> {
  const response = await fetcher(
    `/api/poster/status?posterTaskId=${encodeURIComponent(posterTaskId)}`,
    { cache: "no-store" },
  )
  const data = await readJson(response)
  if (!response.ok) {
    throw new Error(parseApiErrorResponse(response.status, data, "海报状态查询失败"))
  }
  return data as PosterStatusResponse
}

export async function waitForPosterResult(
  posterTaskId: string,
  options: PosterPollOptions = {},
): Promise<PosterStatusResponse> {
  const fetcher = options.fetcher ?? fetch
  const intervalMs = options.intervalMs ?? 2_000
  const timeoutMs = options.timeoutMs ?? 10 * 60_000
  const now = options.now ?? Date.now
  const sleep = options.sleep ?? abortableDelay
  const startedAt = now()

  while (now() - startedAt <= timeoutMs) {
    if (options.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError")
    }
    const status = await queryPosterStatus(posterTaskId, fetcher)
    if (status.status === "success") return status
    if (status.status === "failed") {
      throw new Error(status.error || "海报生成失败")
    }
    await sleep(intervalMs, options.signal)
  }

  throw new Error("海报生成超时，请稍后重试")
}
