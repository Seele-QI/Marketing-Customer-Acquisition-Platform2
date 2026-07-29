import type { ImageAspectRatio } from "@/lib/image-workbench/types"

export type ImageWorkbenchViewStatus = "idle" | "running" | "success" | "failed"

export type ImageWorkbenchResultState = {
  status: ImageWorkbenchViewStatus
  taskId: string
  imageUrls: string[]
  aspectRatio: ImageAspectRatio
  stageLabel: string
  warning: string
  error: string
}

export { ImageResultCanvas as ImageResultGallery } from "@/components/image-workbench/image-result-canvas"
