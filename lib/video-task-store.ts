import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
  type VideoPromptMode,
} from "@/lib/video/video-prompt-presets"

/**
 * 视频创作任务状态持久化层（localStorage）
 * 解决的问题：用户提交视频创作任务后，切换 sidebar 到其他板块，
 * 组件卸载后 useState 状态丢失，回来看到 "请选择视频" 初始状态，
 * 实际后端 task_store 还在跑（20-50 分钟），但前端 UI 已被重置。
 *
 * 方案：把核心任务状态写入 localStorage，跨页面/刷新/重开浏览器都保留。
 */

const STORAGE_KEY = "video-creation-task"

export type TaskStatus = "pending" | "scanning" | "polling" | "post_processing" | "published" | "post_failed" | "success" | "failed"
export type CoverStatus = "idle" | "running" | "success" | "failed"

/** 当前执行阶段，用于刷新后恢复 */
export type TaskStage = "idle" | "voice" | "video" | "post" | "editing" | "done" | "failed"

/** 分段进度，每段 0-100 */
export type StageProgress = {
  voiceClone: number
  videoGen: number
  editing: number
}

export type VideoTaskState = {
  // 任务标识
  taskId: string

  // 任务状态
  status: TaskStatus
  /** 综合进度（向后兼容保留字段），voiceClone * 0.25 + videoGen * 0.65 + editing * 0.10 计算 */
  progress: number
  /** 分段进度，每段独立更新 */
  stageProgress: StageProgress
  /** 当前活跃阶段 */
  currentStage: TaskStage
  /** 上次心跳时间戳，用于刷新后计算 elapsed 重新估算 voiceClone */
  lastHeartbeat: number
  isProcessing: boolean
  errorMessage: string

  // 产出
  videoUrl: string
  coverUrl: string
  coverStatus: CoverStatus
  coverError: string
  coverTaskId: string

  // 输入
  script: string
  gender: "male" | "female"
  videoPrompt: string
  videoPromptMode: VideoPromptMode

  // 素材
  imageBase64: string
  imagePreview: string
  audioBase64: string
  audioName: string
  audioDuration: string

  // 剪辑
  businessCardText: string
  bgmVolume: number
  isEditing: boolean
  editingErrorMessage: string
  postProcessingStage: string
  postProcessingProgress: number
  postProcessingErrorMessage: string
  qrDataUrl: string
  shareUrl: string
  copied: boolean

  // 时间
  createdAt: number
  updatedAt: number
  submittedAt: number
  lastStatusAt: number
  /** 视频生成阶段（拿到 taskId）的启动时间戳，用于硬超时判断 */
  videoStageStartedAt: number
  /** 恢复轮询后的宽限截止时间，避免首轮同步前按旧状态误判失败 */
  resumeGraceUntil: number
  pollErrorCount: number
  lastPollError: string
}

export type TaskStoreErrorKind = "quota-exceeded" | "storage-unavailable" | "unknown"

export type TaskStoreSaveResult =
  | {
    ok: true
    state: VideoTaskState
  }
  | {
    ok: false
    state: VideoTaskState
    errorKind: TaskStoreErrorKind
  }

function createDefaultStageProgress(): StageProgress {
  return { voiceClone: 0, videoGen: 0, editing: 0 }
}

const DEFAULT_PROGRESS: StageProgress = createDefaultStageProgress()

const DEFAULT_STATE: Omit<VideoTaskState, "taskId" | "createdAt" | "updatedAt"> = {
  status: "pending",
  progress: 0,
  stageProgress: createDefaultStageProgress(),
  currentStage: "idle",
  lastHeartbeat: 0,
  isProcessing: false,
  errorMessage: "",
  videoUrl: "",
  coverUrl: "",
  coverStatus: "idle",
  coverError: "",
  coverTaskId: "",
  script: "",
  gender: "female",
  videoPrompt: VIDEO_PROMPT_PRESETS[DEFAULT_VIDEO_PROMPT_MODE],
  videoPromptMode: DEFAULT_VIDEO_PROMPT_MODE,
  imageBase64: "",
  imagePreview: "",
  audioBase64: "",
  audioName: "",
  audioDuration: "",
  businessCardText: "",
  bgmVolume: 0.52,
  isEditing: false,
  editingErrorMessage: "",
  postProcessingStage: "",
  postProcessingProgress: 0,
  postProcessingErrorMessage: "",
  qrDataUrl: "",
  shareUrl: "",
  copied: false,
  submittedAt: 0,
  lastStatusAt: 0,
  videoStageStartedAt: 0,
  resumeGraceUntil: 0,
  pollErrorCount: 0,
  lastPollError: "",
}

/** 计算综合进度（权重：音色 25% + 视频 65% + 剪辑 10%） */
export function calcOverallProgress(p: StageProgress): number {
  return Math.round(p.voiceClone * 0.25 + p.videoGen * 0.65 + p.editing * 0.10)
}

/** 根据已用秒数估算 voiceClone 阶段进度，0-300s 映射到 0-100% */
export function estimateVoiceCloneProgress(elapsedSec: number): number {
  if (elapsedSec <= 0) return 0
  if (elapsedSec <= 30) return Math.round((elapsedSec / 30) * 20)
  if (elapsedSec <= 180) return Math.round(20 + ((elapsedSec - 30) / 150) * 60)
  if (elapsedSec <= 300) return Math.round(80 + ((elapsedSec - 180) / 120) * 15)
  return 95
}

/** 从 localStorage 读取任务状态。脏数据自动重置：isProcessing=true 但无 taskId，
 *  是上次提交后页面崩溃/关闭留下的"假生成中"状态。 */
export function loadTask(): VideoTaskState | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<VideoTaskState>
    const now = Date.now()

    // 脏数据：标记"处理中"但没有任何 taskId，也没有心跳 → 整段作废
    const isStuck = parsed.isProcessing === true
      && !parsed.taskId
      && (!parsed.lastHeartbeat || parsed.lastHeartbeat === 0)
    if (isStuck) {
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* silent */ }
      return null
    }

    // 脏数据：超过 30 分钟没动静的处理中任务，视为遗留
    const STUCK_MS = 30 * 60 * 1000
    if (parsed.isProcessing === true && parsed.updatedAt) {
      if (now - parsed.updatedAt > STUCK_MS) {
        try { localStorage.removeItem(STORAGE_KEY) } catch { /* silent */ }
        return null
      }
    }

    // 仅拿到 taskId 后才有可恢复的后端轮询任务。
    // 若刷新/重新进入页面时仍处于"处理中"但没有 taskId，前端已无法继续等待原请求，
    // 继续恢复只会造成假性"生成中"卡住，因此直接转为失败态并保留素材供用户重试。
    if (parsed.isProcessing === true && !parsed.taskId) {
      return {
        ...DEFAULT_STATE,
        ...parsed,
        taskId: "",
        status: "failed",
        currentStage: "failed",
        isProcessing: false,
        progress: 0,
        stageProgress: createDefaultStageProgress(),
        lastHeartbeat: 0,
        lastStatusAt: 0,
        videoStageStartedAt: 0,
        resumeGraceUntil: 0,
        pollErrorCount: 0,
        lastPollError: "",
        videoUrl: "",
        coverUrl: "",
        createdAt: parsed.createdAt ?? now,
        submittedAt: parsed.submittedAt ?? now,
        updatedAt: now,
        errorMessage: "检测到上次生成停留在提交阶段且未返回 taskId，当前页面无法恢复该任务，请重新生成。",
      }
    }

    return {
      ...DEFAULT_STATE,
      ...parsed,
      stageProgress: {
        ...DEFAULT_PROGRESS,
        ...(parsed.stageProgress ?? {}),
      },
      taskId: parsed.taskId ?? "",
      coverStatus: parsed.coverStatus === "running" || parsed.coverStatus === "success" || parsed.coverStatus === "failed"
        ? parsed.coverStatus
        : "idle",
      coverError: parsed.coverError ?? "",
      coverTaskId: parsed.coverTaskId ?? "",
      businessCardText: parsed.businessCardText ?? "",
      bgmVolume: typeof parsed.bgmVolume === "number" ? parsed.bgmVolume : 0.32,
      videoPrompt: resolveVideoPrompt(typeof parsed.videoPrompt === "string" ? parsed.videoPrompt : ""),
      videoPromptMode:
        parsed.videoPromptMode === "natural" ||
        parsed.videoPromptMode === "mode2" ||
        parsed.videoPromptMode === "mode3"
          ? parsed.videoPromptMode
          : DEFAULT_VIDEO_PROMPT_MODE,
      createdAt: parsed.createdAt ?? now,
      updatedAt: parsed.updatedAt ?? now,
    }
  } catch {
    return null
  }
}

function mergeTaskState(state: Partial<VideoTaskState>): VideoTaskState {
  const prev = loadTask() || ({} as VideoTaskState)
  return {
    ...DEFAULT_STATE,
    ...prev,
    ...state,
    stageProgress: state.stageProgress
      ? { ...state.stageProgress }
      : prev.stageProgress
        ? { ...prev.stageProgress }
        : createDefaultStageProgress(),
    updatedAt: Date.now(),
  }
}

function isQuotaExceededError(error: unknown): boolean {
  return error instanceof DOMException && (
    error.name === "QuotaExceededError" ||
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014
  )
}

function getTaskStoreErrorKind(error: unknown): TaskStoreErrorKind {
  if (isQuotaExceededError(error)) {
    return "quota-exceeded"
  }
  if (error instanceof DOMException) {
    return "storage-unavailable"
  }
  return "unknown"
}

export function getTaskStoreErrorMessage(errorKind: TaskStoreErrorKind): string {
  switch (errorKind) {
    case "quota-exceeded":
      return "浏览器本地存储空间不足，当前素材和任务进度可能无法完整保存；建议压缩素材后重试，避免刷新后恢复失败。"
    case "storage-unavailable":
      return "浏览器当前不可用本地存储，任务进度和素材可能无法恢复。"
    default:
      return "保存本地任务草稿失败，刷新页面后可能无法恢复当前素材和进度。"
  }
}

/** 保存任务状态到 localStorage */
export function saveTask(state: Partial<VideoTaskState>): TaskStoreSaveResult {
  const merged = mergeTaskState(state)
  if (typeof window === "undefined") {
    return {
      ok: false,
      state: merged,
      errorKind: "storage-unavailable",
    }
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
    return { ok: true, state: merged }
  } catch (error) {
    return {
      ok: false,
      state: merged,
      errorKind: getTaskStoreErrorKind(error),
    }
  }
}

/** 清除任务状态（任务完成/失败/重置时调用） */
export function clearTask(): void {
  if (typeof window === "undefined") return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* silent */ }
}

/** 创建一个新的任务状态（生成新的 taskId） */
export function createNewTask(): VideoTaskState {
  const now = Date.now()
  return {
    ...DEFAULT_STATE,
    stageProgress: createDefaultStageProgress(),
    taskId: "",
    createdAt: now,
    updatedAt: now,
  }
}
