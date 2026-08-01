import type { SubmitImageWorkbenchInput } from "@/lib/image-workbench/api"
import type {
  ImageWorkbenchMode,
  ReferenceRole,
} from "@/lib/image-workbench/types"

export type ImageWorkbenchPanelDraft = {
  request: SubmitImageWorkbenchInput | null
  referenceCount: number
  outputLabel: string
}

export type GeneratedReferenceSeed = {
  id: string
  mode: ImageWorkbenchMode
  url: string
  role: ReferenceRole
}
