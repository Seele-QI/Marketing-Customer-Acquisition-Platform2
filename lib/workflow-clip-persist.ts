/**
 * 图文/混剪工作流 — 草稿与 IndexedDB 素材同步辅助
 */
import type { AssetRef, ImageVideoDraft, MashupDraft } from "@/lib/workflow-draft-store"
import {
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
  type CoverAspectRatio,
  type CoverResolution,
} from "@/lib/video/cover-constants"
import {
  blobToBase64,
  blobToDataUrl,
  clearWorkflowAssets,
  dataUrlToBlob,
  getWorkflowAsset,
  newAssetId,
  putWorkflowAsset,
} from "@/lib/workflow-asset-store"

export type ClipImageItem = {
  id: string
  file: File
  previewUrl: string
  base64: string
}

export type ClipAudioItem = {
  file: File
  name: string
  base64: string
}

export type ClipVideoItem = {
  id: string
  file: File
  previewUrl: string
  base64: string
}

export async function persistClipImage(
  workflow: "image-video" | "mashup",
  file: File,
  base64: string,
  previewUrl: string,
): Promise<{ id: string; ref: AssetRef } | null> {
  const id = newAssetId(workflow === "image-video" ? "iv_img" : "mv_vid")
  const result = await putWorkflowAsset({
    id,
    workflow,
    name: file.name,
    mime: file.type || "application/octet-stream",
    kind: workflow === "image-video" ? "image" : "video",
    blob: file,
  })
  if (!result.ok) return null
  return {
    id,
    ref: {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: workflow === "image-video" ? "image" : "video",
    },
  }
}

export async function persistClipAudio(
  workflow: "image-video" | "mashup",
  file: File,
  base64: string,
): Promise<{ id: string; ref: AssetRef } | null> {
  const id = newAssetId("clip_audio")
  const result = await putWorkflowAsset({
    id,
    workflow,
    name: file.name,
    mime: file.type || "audio/mpeg",
    kind: "audio",
    blob: file,
  })
  if (!result.ok) return null
  return {
    id,
    ref: {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: "audio",
    },
  }
}

export async function hydrateClipImages(
  workflow: "image-video",
  refs: AssetRef[],
): Promise<ClipImageItem[]> {
  const out: ClipImageItem[] = []
  for (const ref of refs) {
    const stored = await getWorkflowAsset(ref.id)
    if (!stored) continue
    const base64 = await blobToBase64(stored.blob)
    const previewUrl = await blobToDataUrl(stored.blob)
    const file = new File([stored.blob], stored.name, { type: stored.mime })
    out.push({ id: ref.id, file, previewUrl, base64 })
  }
  return out
}

export async function hydrateMashupVideos(refs: AssetRef[]): Promise<Array<{
  id: string
  file: File
  name: string
  base64: string
  duration: number
}>> {
  const out: Array<{ id: string; file: File; name: string; base64: string; duration: number }> = []
  for (const ref of refs) {
    const stored = await getWorkflowAsset(ref.id)
    if (!stored) continue
    const base64 = await blobToBase64(stored.blob)
    const file = new File([stored.blob], stored.name, { type: stored.mime })
    out.push({
      id: ref.id,
      file,
      name: stored.name,
      base64,
      duration: 0,
    })
  }
  return out
}

export async function hydrateClipAudio(ref: AssetRef | null): Promise<ClipAudioItem | null> {
  if (!ref) return null
  const stored = await getWorkflowAsset(ref.id)
  if (!stored) return null
  const base64 = await blobToBase64(stored.blob)
  const file = new File([stored.blob], stored.name, { type: stored.mime })
  return { file, name: stored.name, base64 }
}

export async function hydrateClipCoverImage(ref: AssetRef | null): Promise<ClipImageItem | null> {
  if (!ref) return null
  const stored = await getWorkflowAsset(ref.id)
  if (!stored) return null
  const base64 = await blobToBase64(stored.blob)
  const previewUrl = await blobToDataUrl(stored.blob)
  const file = new File([stored.blob], stored.name, { type: stored.mime })
  return { id: ref.id, file, previewUrl, base64 }
}

export async function persistMashupCoverImage(
  file: File,
  base64: string,
  previewUrl: string,
): Promise<{ id: string; ref: AssetRef } | null> {
  const id = newAssetId("mv_cover")
  const result = await putWorkflowAsset({
    id,
    workflow: "mashup",
    name: file.name,
    mime: file.type || "image/png",
    kind: "image",
    blob: file,
  })
  if (!result.ok) return null
  return {
    id,
    ref: {
      id,
      name: file.name,
      mime: file.type,
      size: file.size,
      kind: "image",
    },
  }
}

export async function clearClipWorkflow(workflow: "image-video" | "mashup"): Promise<void> {
  await clearWorkflowAssets(workflow)
}

export function imageVideoDraftFromState(state: {
  currentStep: 1 | 2 | 3
  script: string
  enableBgm: boolean
  enableSubtitles: boolean
  taskId: string
  stageLabel: string
  progress: number
  errorMessage: string
  submittedAt: number
  images: ClipImageItem[]
  audioSample: ClipAudioItem | null
  imageRefs: AssetRef[]
  audioRef: AssetRef | null
  coverAspectRatio?: CoverAspectRatio
  coverResolution?: CoverResolution
}): ImageVideoDraft {
  return {
    coverAspectRatio: state.coverAspectRatio ?? DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: state.coverResolution ?? DEFAULT_COVER_RESOLUTION,
    currentStep: state.currentStep,
    script: state.script,
    enableBgm: state.enableBgm,
    enableSubtitles: state.enableSubtitles,
    taskId: state.taskId,
    stageLabel: state.stageLabel,
    progress: state.progress,
    errorMessage: state.errorMessage,
    submittedAt: state.submittedAt,
    imageRefs: state.imageRefs,
    audioRef: state.audioRef,
  }
}

export function mashupDraftFromState(state: {
  currentStep: 1 | 2 | 3
  script: string
  enableBgm: boolean
  enableSubtitles: boolean
  taskId: string
  stageLabel: string
  progress: number
  errorMessage: string
  submittedAt: number
  videoRefs: AssetRef[]
  audioRef: AssetRef | null
  coverImageRef?: AssetRef | null
  coverAspectRatio?: CoverAspectRatio
  coverResolution?: CoverResolution
}): MashupDraft {
  return {
    coverAspectRatio: state.coverAspectRatio ?? DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: state.coverResolution ?? DEFAULT_COVER_RESOLUTION,
    currentStep: state.currentStep,
    script: state.script,
    enableBgm: state.enableBgm,
    enableSubtitles: state.enableSubtitles,
    taskId: state.taskId,
    stageLabel: state.stageLabel,
    progress: state.progress,
    errorMessage: state.errorMessage,
    submittedAt: state.submittedAt,
    videoRefs: state.videoRefs,
    audioRef: state.audioRef,
    coverImageRef: state.coverImageRef ?? null,
  }
}

export { dataUrlToBlob }
