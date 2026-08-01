export type EconomySegmentStatus = {
  index: number
  status: string
  upstream_id?: string
  video_url?: string
  error?: string
  retry_count?: number
}

export type EconomyStatus = {
  task_id: string
  status: string
  stage?: string
  stage_label?: string
  progress?: number
  audio_duration?: number
  segment_count?: number
  segments_completed?: number
  segments?: EconomySegmentStatus[]
  video_url?: string
  result_url?: string
  error?: string
}

async function readResponse<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => ({}))) as T & {
    detail?: string | { message?: string }
  }
  if (!response.ok) {
    const detail = data.detail
    throw new Error(typeof detail === "string" ? detail : detail?.message || `请求失败（${response.status}）`)
  }
  return data
}

export async function submitEconomyVideo(payload: {
  image_base64: string
  audio_base64: string
  script: string
  motion_prompt: string
}): Promise<{ task_id: string; status: string }> {
  return readResponse(
    await fetch("/api/dh-video-economy/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  )
}

export async function queryEconomyStatus(taskId: string): Promise<EconomyStatus> {
  return readResponse(await fetch(`/api/dh-video-economy/status?taskId=${encodeURIComponent(taskId)}`))
}

export async function retryEconomySegment(taskId: string, segmentIndex: number): Promise<void> {
  await readResponse(
    await fetch("/api/dh-video-economy/retry-segment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId, segmentIndex }),
    }),
  )
}

export async function cancelEconomyVideo(taskId: string): Promise<void> {
  await readResponse(
    await fetch("/api/dh-video-economy/cancel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId }),
    }),
  )
}
