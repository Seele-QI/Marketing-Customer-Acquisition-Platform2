import type { VideoTaskState } from "@/lib/video-task-store"

export type WorkflowStepId = 1 | 2 | 3 | 4

export type WorkflowStepStatus = "pending" | "active" | "loading" | "done" | "error"

export type WorkflowUiState = {
  activeStep: WorkflowStepId
  stepStatuses: Record<WorkflowStepId, WorkflowStepStatus>
  shouldResumePolling: boolean
}

export type TaskHealth = {
  noStatusTooLong: boolean
  legacyProcessingTooLong: boolean
  waitingTaskIdTooLong: boolean
  hardTimeout: boolean
  tooManyPollErrors: boolean
  shouldFail: boolean
}

export const POLL_ERROR_LIMIT = 5
export const STATUS_STALE_MS = 120_000       // 2min（浏览器后台标签页会节流定时器到 ~1min，留余量）
export const TASK_TIMEOUT_MS = 60 * 60_000
export const RESUME_POLL_GRACE_MS = 30_000   // 30s（切屏回来给足够时间恢复轮询）
export const WAIT_TASK_ID_MS = 12 * 60_000
export const LEGACY_PROCESSING_GRACE_MS = 30_000

const DEFAULT_STEP_STATUSES: Record<WorkflowStepId, WorkflowStepStatus> = {
  1: "active",
  2: "pending",
  3: "pending",
  4: "pending",
}

export function createGenerateSubmissionPatch(submittedAt: number): Partial<VideoTaskState> {
  return {
    status: "scanning",
    currentStage: "voice",
    lastHeartbeat: submittedAt,
    submittedAt,
    lastStatusAt: 0,
    resumeGraceUntil: 0,
    pollErrorCount: 0,
    lastPollError: "",
    taskId: "",
    isProcessing: true,
    errorMessage: "",
    editingErrorMessage: "",
    videoUrl: "",
    coverUrl: "",
    progress: 0,
    videoStageStartedAt: 0,
    postProcessingStage: "",
    postProcessingProgress: 0,
    postProcessingErrorMessage: "",
    stageProgress: { voiceClone: 0, videoGen: 0, editing: 0 },
  }
}

export function getTaskHealth(state: VideoTaskState, now = Date.now()): TaskHealth {
  const isVideoPollingStage = state.currentStage === "video" && state.isProcessing
  const isInResumeGrace = state.isProcessing && state.resumeGraceUntil > now
  const isLegacyProcessing = state.isProcessing && !state.taskId && state.currentStage === "idle"
  const isWaitingTaskId = state.isProcessing && !state.taskId && (state.currentStage === "voice" || isLegacyProcessing)
  const isTimedVideoStage =
    state.isProcessing &&
    !!state.taskId &&
    (state.currentStage === "video" || state.currentStage === "editing" || state.status === "polling" || state.status === "post_processing")

  const noStatusTooLong =
    isVideoPollingStage &&
    !isInResumeGrace &&
    state.lastStatusAt > 0 &&
    now - state.lastStatusAt > STATUS_STALE_MS

  const waitingTaskIdTooLong =
    isWaitingTaskId &&
    !isInResumeGrace &&
    state.submittedAt > 0 &&
    now - state.submittedAt > WAIT_TASK_ID_MS

  const legacyProcessingTooLong =
    isLegacyProcessing &&
    !isInResumeGrace &&
    state.submittedAt > 0 &&
    now - state.submittedAt > LEGACY_PROCESSING_GRACE_MS

  const hardTimeout =
    isTimedVideoStage &&
    !isInResumeGrace &&
    state.videoStageStartedAt > 0 &&
    now - state.videoStageStartedAt > TASK_TIMEOUT_MS

  const tooManyPollErrors =
    isVideoPollingStage &&
    !isInResumeGrace &&
    state.pollErrorCount >= POLL_ERROR_LIMIT

  return {
    noStatusTooLong,
    legacyProcessingTooLong,
    waitingTaskIdTooLong,
    hardTimeout,
    tooManyPollErrors,
    shouldFail: noStatusTooLong || legacyProcessingTooLong || waitingTaskIdTooLong || hardTimeout || tooManyPollErrors,
  }
}

export function getTaskHealthMessage(state: VideoTaskState, now = Date.now()): string {
  const health = getTaskHealth(state, now)

  if (health.hardTimeout) {
    return "任务处理超时，请稍后重试或重新提交。"
  }

  if (health.noStatusTooLong) {
    return "任务状态长时间未更新，已停止自动轮询。"
  }

  if (health.legacyProcessingTooLong) {
    return "检测到旧版本生成状态未完整恢复，请点击重新生成。"
  }

  if (health.waitingTaskIdTooLong) {
    return "任务提交后长时间未返回 taskId，请重试生成。"
  }

  if (health.tooManyPollErrors) {
    return "任务状态同步连续失败，请检查后端服务后重试。"
  }

  return ""
}

export function deriveWorkflowUi(state: VideoTaskState, now = Date.now()): WorkflowUiState {
  const health = getTaskHealth(state, now)
  const hasGeneratedVideo = !!state.videoUrl && state.stageProgress.videoGen >= 100 && !state.isProcessing

  if (state.currentStage === "voice" && state.isProcessing) {
    return {
      activeStep: 2,
      stepStatuses: { 1: "done", 2: "loading", 3: "pending", 4: "pending" },
      shouldResumePolling: false,
    }
  }

  if (state.isProcessing && !state.taskId && state.currentStage === "idle") {
    return {
      activeStep: 2,
      stepStatuses: { 1: "done", 2: "loading", 3: "pending", 4: "pending" },
      shouldResumePolling: false,
    }
  }

  if (state.currentStage === "editing") {
    return {
      activeStep: 4,
      stepStatuses: { 1: "done", 2: "done", 3: "done", 4: "active" },
      shouldResumePolling: false,
    }
  }

  if (state.currentStage === "done" || state.status === "success" || hasGeneratedVideo) {
    return {
      activeStep: 4,
      stepStatuses: { 1: "done", 2: "done", 3: "done", 4: "active" },
      shouldResumePolling: false,
    }
  }

  if (
    state.currentStage === "failed" ||
    state.status === "failed" ||
    !!state.errorMessage ||
    health.shouldFail
  ) {
    return {
      activeStep: 3,
      stepStatuses: { 1: "done", 2: "done", 3: "error", 4: "pending" },
      shouldResumePolling: false,
    }
  }

  if (state.currentStage === "video" && state.isProcessing && !!state.taskId) {
    return {
      activeStep: 3,
      stepStatuses: { 1: "done", 2: "done", 3: "loading", 4: "pending" },
      shouldResumePolling: !health.shouldFail,
    }
  }

  return {
    activeStep: 1,
    stepStatuses: DEFAULT_STEP_STATUSES,
    shouldResumePolling: false,
  }
}
