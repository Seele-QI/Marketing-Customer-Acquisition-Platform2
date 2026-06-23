import assert from "node:assert/strict"
import test from "node:test"

import { createNewTask } from "../lib/video-task-store.ts"
import {
  createGenerateSubmissionPatch,
  getTaskHealth,
} from "../lib/video-task-runtime.ts"

test("新任务提交补丁会清掉旧任务遗留的超时与后处理状态", () => {
  const submittedAt = Date.now()

  const patch = createGenerateSubmissionPatch(submittedAt)

  assert.deepEqual(patch, {
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
  })
})

test("视频任务在50分钟业务承诺窗口内不会被前端本地超时误判", () => {
  const now = Date.now()
  const state = {
    ...createNewTask(),
    taskId: "task-1",
    isProcessing: true,
    currentStage: "video" as const,
    status: "polling" as const,
    videoStageStartedAt: now - 46 * 60_000,
    submittedAt: now - 47 * 60_000,
  }

  const health = getTaskHealth(state, now)

  assert.equal(health.hardTimeout, false)
  assert.equal(health.shouldFail, false)
})

test("旧任务残留的 videoStageStartedAt 不会让新的 voice 阶段提交立即被判超时", () => {
  const now = Date.now()
  const state = {
    ...createNewTask(),
    taskId: "",
    isProcessing: true,
    currentStage: "voice" as const,
    status: "scanning" as const,
    videoStageStartedAt: now - 3 * 60 * 60_000,
    submittedAt: now - 5_000,
  }

  const health = getTaskHealth(state, now)

  assert.equal(health.hardTimeout, false)
  assert.equal(health.shouldFail, false)
})
