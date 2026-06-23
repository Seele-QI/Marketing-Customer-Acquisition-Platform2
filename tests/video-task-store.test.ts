import assert from "node:assert/strict"
import test from "node:test"

import { createNewTask, loadTask } from "../lib/video-task-store.ts"
import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_PRESETS,
} from "../lib/video/video-prompt-presets.ts"

function createMemoryStorage(seed?: Record<string, string>) {
  const store = new Map(Object.entries(seed ?? {}))
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null
    },
    setItem(key: string, value: string) {
      store.set(key, value)
    },
    removeItem(key: string) {
      store.delete(key)
    },
  }
}

function withMockBrowserEnv(storage: ReturnType<typeof createMemoryStorage>, run: () => void) {
  const windowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window")
  const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage")

  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })

  try {
    run()
  } finally {
    if (windowDescriptor) {
      Object.defineProperty(globalThis, "window", windowDescriptor)
    } else {
      // @ts-expect-error 测试环境下允许清理注入属性
      delete globalThis.window
    }

    if (localStorageDescriptor) {
      Object.defineProperty(globalThis, "localStorage", localStorageDescriptor)
    } else {
      // @ts-expect-error 测试环境下允许清理注入属性
      delete globalThis.localStorage
    }
  }
}

test("新任务默认带自然模式提示词和模式标记", () => {
  const task = createNewTask()
  assert.equal(task.videoPromptMode, "natural")
  assert.equal(task.videoPrompt, VIDEO_PROMPT_PRESETS.natural)
})

test("新任务之间的 stageProgress 默认值互不共享引用", () => {
  const firstTask = createNewTask()
  const secondTask = createNewTask()

  firstTask.stageProgress.voiceClone = 88

  assert.notStrictEqual(firstTask.stageProgress, secondTask.stageProgress)
  assert.equal(secondTask.stageProgress.voiceClone, 0)
  assert.equal(secondTask.stageProgress.videoGen, 0)
  assert.equal(secondTask.stageProgress.editing, 0)
})

test("旧任务缺少 videoPrompt 字段时会自动补自然模式", () => {
  const storage = createMemoryStorage({
    "video-creation-task": JSON.stringify({
      taskId: "legacy-task",
      script: "旧文案",
      isProcessing: false,
      updatedAt: Date.now(),
    }),
  })

  withMockBrowserEnv(storage, () => {
    const loaded = loadTask()

    assert.equal(loaded?.videoPromptMode, "natural")
    assert.equal(loaded?.videoPrompt, VIDEO_PROMPT_PRESETS.natural)
  })
})

test("旧任务已有自定义 videoPrompt 时不会被默认值覆盖", () => {
  const customPrompt = "自定义第一行\n自定义第二行"
  const storage = createMemoryStorage({
    "video-creation-task": JSON.stringify({
      taskId: "custom-task",
      script: "旧文案",
      isProcessing: false,
      updatedAt: Date.now(),
      videoPrompt: customPrompt,
      videoPromptMode: "mode2",
    }),
  })

  withMockBrowserEnv(storage, () => {
    const loaded = loadTask()

    assert.equal(loaded?.videoPrompt, customPrompt)
    assert.equal(loaded?.videoPromptMode, "mode2")
  })
})

test("旧任务带非法 videoPromptMode 时会回退到自然模式", () => {
  const storage = createMemoryStorage({
    "video-creation-task": JSON.stringify({
      taskId: "invalid-mode-task",
      script: "旧文案",
      isProcessing: false,
      updatedAt: Date.now(),
      videoPrompt: "保留原始提示词",
      videoPromptMode: "unexpected-mode",
    }),
  })

  withMockBrowserEnv(storage, () => {
    const loaded = loadTask()

    assert.equal(loaded?.videoPrompt, "保留原始提示词")
    assert.equal(loaded?.videoPromptMode, DEFAULT_VIDEO_PROMPT_MODE)
  })
})
