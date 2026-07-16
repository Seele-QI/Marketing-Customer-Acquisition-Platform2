import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"

export type SubmitVideoCoverParams = {
  script: string
  referenceImageBase64?: string
  referenceImageUrl?: string
  aspectRatio?: CoverAspectRatio
  resolution?: CoverResolution
  linkedTaskId?: string
  source?: string
}

export type CoverSubmitResponse = {
  cover_task_id: string
}

export type CoverStatusResponse = {
  cover_task_id: string
  status: "queued" | "running" | "success" | "failed" | string
  cover_url?: string
  error?: string
  stage_label?: string
}

export async function submitVideoCover(params: SubmitVideoCoverParams): Promise<CoverSubmitResponse> {
  const res = await fetch("/api/video/cover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      script: params.script,
      reference_image_base64: params.referenceImageBase64 ?? "",
      reference_image_url: params.referenceImageUrl ?? "",
      aspect_ratio: params.aspectRatio ?? DEFAULT_COVER_ASPECT_RATIO,
      resolution: params.resolution ?? DEFAULT_COVER_RESOLUTION,
      linked_task_id: params.linkedTaskId ?? "",
      source: params.source ?? "",
    }),
  })

  const data = (await res.json().catch(() => ({}))) as CoverSubmitResponse & {
    detail?: string | { message?: string }
  }
  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : typeof data.detail === "object" && data.detail?.message
          ? data.detail.message
          : `封面提交失败 (${res.status})`
    throw new Error(detail)
  }
  if (!data.cover_task_id) {
    throw new Error("封面提交未返回任务 ID")
  }
  return data
}

export async function queryVideoCoverStatus(coverTaskId: string): Promise<CoverStatusResponse> {
  const res = await fetch(
    `/api/video/cover/status?coverTaskId=${encodeURIComponent(coverTaskId)}`,
    { cache: "no-store" },
  )
  const data = (await res.json().catch(() => ({}))) as CoverStatusResponse & {
    detail?: string | { message?: string }
  }
  if (!res.ok) {
    const detail =
      typeof data.detail === "string"
        ? data.detail
        : typeof data.detail === "object" && data.detail?.message
          ? data.detail.message
          : `封面状态查询失败 (${res.status})`
    throw new Error(detail)
  }
  return data
}
