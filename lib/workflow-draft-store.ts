/**
 * 工作流轻量草稿 — localStorage 持久化步骤/文案/配置/素材引用
 * 大文件本体存 workflow-asset-store (IndexedDB)
 */
import type { TaskKind } from "@/lib/task-runtime/types"
import type { CoverAspectRatio, CoverResolution } from "@/lib/video/cover-constants"
import { DEFAULT_COVER_ASPECT_RATIO, DEFAULT_COVER_RESOLUTION } from "@/lib/video/cover-constants"

type CoverDraftFields = {
  coverAspectRatio: CoverAspectRatio
  coverResolution: CoverResolution
}

export const DRAFT_STORAGE_KEY = "agenthub-workflow-drafts"

export type DraftKind =
  | TaskKind
  | "copywriting-extract"

export type AssetRef = {
  id: string
  name: string
  mime: string
  size: number
  kind: "image" | "audio" | "video"
  /** 展示用元数据，如音频时长 */
  meta?: string
}

export type ImageVideoDraft = CoverDraftFields & {
  currentStep: 1 | 2 | 3
  script: string
  enableBgm: boolean
  enableSubtitles: boolean
  taskId: string
  stageLabel: string
  progress: number
  errorMessage: string
  submittedAt: number
  imageRefs: AssetRef[]
  audioRef: AssetRef | null
}

export type MashupDraft = CoverDraftFields & {
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
  coverImageRef: AssetRef | null
}

export type DhVideoV2Draft = CoverDraftFields & {
  step: "compose" | "scriptPlan" | "generating" | "preview"
  script: string
  creativeIdea: string
  aspectRatio: string
  scriptPlanJson: string
  planErr: string
  showAdvancedPlan: boolean
  taskId: string
  genStatus: "idle" | "running" | "done" | "fail"
  genProgress: number
  genStage: string
  genErr: string
  videoUrl: string
  imageRefs: AssetRef[]
  audioRefs: AssetRef[]
}

export type DhVideoEconomyDraft = CoverDraftFields & {
  script: string
  motionPreset: "natural" | "friendly" | "professional" | "relaxed" | "custom"
  customMotionPrompt: string
  taskId: string
  imageRefs: AssetRef[]
  audioRef: AssetRef | null
}

export type PromoVideoDraft = CoverDraftFields & {
  step: "form" | "storyboard" | "prompt" | "video"
  formData: {
    productPrompt: string
    promoScript: string
    duration: number
    frameCount: number
    ratio: string
    channel: string
    resolution: string
    imageMode: string
    instanceType: string
  }
  storyTaskId: string
  sbStatus: string
  sbProgress: number
  sbStageLabel: string
  videoTaskId: string
  vidStatus: string
  vidProgress: number
  vidStageLabel: string
  videoUrl: string
  imageRef: AssetRef | null
  audioRef: AssetRef | null
}

export type CopywritingExtractDraft = {
  url: string
  editedText: string
}

export type WorkflowDraftMap = {
  "image-video": ImageVideoDraft
  mashup: MashupDraft
  "dh-video-v2": DhVideoV2Draft
  "dh-video-economy": DhVideoEconomyDraft
  "promo-video": PromoVideoDraft
  "copywriting-extract": CopywritingExtractDraft
}

type DraftStore = Partial<WorkflowDraftMap>

function emptyStore(): DraftStore {
  return {}
}

export function loadAllDrafts(): DraftStore {
  if (typeof window === "undefined") return emptyStore()
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) return emptyStore()
    return JSON.parse(raw) as DraftStore
  } catch {
    return emptyStore()
  }
}

export function loadDraft<K extends keyof WorkflowDraftMap>(kind: K): WorkflowDraftMap[K] | null {
  const all = loadAllDrafts()
  const d = all[kind]
  return d ? (d as WorkflowDraftMap[K]) : null
}

export function saveDraft<K extends keyof WorkflowDraftMap>(
  kind: K,
  draft: Partial<WorkflowDraftMap[K]>,
): void {
  if (typeof window === "undefined") return
  try {
    const all = loadAllDrafts()
    all[kind] = { ...(all[kind] as object), ...draft } as WorkflowDraftMap[K]
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* quota */
  }
}

export function clearDraft(kind: keyof WorkflowDraftMap): void {
  if (typeof window === "undefined") return
  try {
    const all = loadAllDrafts()
    delete all[kind]
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(all))
  } catch {
    /* silent */
  }
}

export function defaultImageVideoDraft(): ImageVideoDraft {
  return {
    coverAspectRatio: DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: DEFAULT_COVER_RESOLUTION,
    currentStep: 1,
    script: "",
    enableBgm: true,
    enableSubtitles: true,
    taskId: "",
    stageLabel: "",
    progress: 0,
    errorMessage: "",
    submittedAt: 0,
    imageRefs: [],
    audioRef: null,
  }
}

export function defaultMashupDraft(): MashupDraft {
  return {
    coverAspectRatio: DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: DEFAULT_COVER_RESOLUTION,
    currentStep: 1,
    script: "",
    enableBgm: true,
    enableSubtitles: true,
    taskId: "",
    stageLabel: "",
    progress: 0,
    errorMessage: "",
    submittedAt: 0,
    videoRefs: [],
    audioRef: null,
    coverImageRef: null,
  }
}

export function defaultDhVideoV2Draft(): DhVideoV2Draft {
  return {
    coverAspectRatio: DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: DEFAULT_COVER_RESOLUTION,
    step: "compose",
    script: "",
    creativeIdea: "",
    aspectRatio: "9:16",
    scriptPlanJson: "",
    planErr: "",
    showAdvancedPlan: false,
    taskId: "",
    genStatus: "idle",
    genProgress: 0,
    genStage: "",
    genErr: "",
    videoUrl: "",
    imageRefs: [],
    audioRefs: [],
  }
}

export function defaultDhVideoEconomyDraft(): DhVideoEconomyDraft {
  return {
    coverAspectRatio: DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: DEFAULT_COVER_RESOLUTION,
    script: "",
    motionPreset: "natural",
    customMotionPrompt: "",
    taskId: "",
    imageRefs: [],
    audioRef: null,
  }
}

export function defaultPromoVideoDraft(): PromoVideoDraft {
  return {
    coverAspectRatio: DEFAULT_COVER_ASPECT_RATIO,
    coverResolution: DEFAULT_COVER_RESOLUTION,
    step: "form",
    formData: {
      productPrompt: "",
      promoScript: "",
      duration: 15,
      frameCount: 9,
      ratio: "adaptive",
      channel: "Third-party",
      resolution: "2k",
      imageMode: "2",
      instanceType: "default",
    },
    storyTaskId: "",
    sbStatus: "idle",
    sbProgress: 0,
    sbStageLabel: "",
    videoTaskId: "",
    vidStatus: "idle",
    vidProgress: 0,
    vidStageLabel: "",
    videoUrl: "",
    imageRef: null,
    audioRef: null,
  }
}

export function defaultCopywritingExtractDraft(): CopywritingExtractDraft {
  return { url: "", editedText: "" }
}
