# 视频提示词板块 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为视频创作页面新增“视频提示词”板块，支持三种默认模式、默认自然模式回填、手动编辑持久化，并把最终文本提交到 FastAPI 后端后映射到 RunningHub `254.inputs.text`。

**Architecture:** 沿用当前真实链路 `components/video-creation-workflow.tsx -> FastAPI /api/video/generate -> lib.runninghub_client.py -> RunningHub workflow`，不动 Next 的 mock 路由。前端新增一个轻量的提示词预设模块和本地持久化字段，后端在 `VideoGenerateRequest` 上新增可选 `video_prompt` 字段，并让 `build_motion_prompt()` 在自定义文本为空时回退自然模式。

**Tech Stack:** React, TypeScript, node:test, FastAPI, Python, pytest, RunningHub

---

## 文件结构

### 需要新增
- `f:\A-项目\13-中台网站\lib\video\video-prompt-presets.ts`
  - 负责维护三种前端模式的默认文案、默认模式常量和文本兜底函数。
- `f:\A-项目\13-中台网站\tests\video-prompt-presets.test.ts`
  - 覆盖预设默认值、模式切换文本和空值兜底。
- `f:\A-项目\13-中台网站\tests\video-task-store.test.ts`
  - 覆盖新增字段的默认初始化与旧任务兼容恢复。

### 需要修改
- `f:\A-项目\13-中台网站\components\video-creation-workflow.tsx`
  - 新增“视频提示词”卡片、模式按钮、文本框和生成请求字段。
- `f:\A-项目\13-中台网站\lib\video-task-store.ts`
  - 为任务状态新增 `videoPrompt` 与 `videoPromptMode` 持久化。
- `f:\A-项目\13-中台网站\lib\video\types.ts`
  - 扩展视频生成请求类型。
- `f:\A-项目\13-中台网站\lib\video\api.ts`
  - 保持封装层请求体类型与真实 FastAPI 接口一致。
- `f:\A-项目\13-中台网站\lib\runninghub_client.py`
  - 为视频动作提示词增加显式兜底和自定义文本入口。
- `f:\A-项目\13-中台网站\main.py`
  - 扩展 FastAPI 请求模型与 `/api/video/generate` 的 RunningHub 提交逻辑。
- `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`
  - 增加 FastAPI 视频生成请求对自定义提示词的回归测试。

## 任务拆分

### Task 1: 先为提示词预设与任务状态持久化写失败测试

**Files:**
- Create: `f:\A-项目\13-中台网站\tests\video-prompt-presets.test.ts`
- Create: `f:\A-项目\13-中台网站\tests\video-task-store.test.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video\video-prompt-presets.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video-task-store.ts`

- [ ] **Step 1: 编写提示词预设默认值失败测试**

```typescript
import assert from "node:assert/strict"
import test from "node:test"

import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
} from "../lib/video/video-prompt-presets.ts"

test("默认模式是自然模式且返回 11 行提示词", () => {
  assert.equal(DEFAULT_VIDEO_PROMPT_MODE, "natural")
  const lines = VIDEO_PROMPT_PRESETS.natural.split("\n")
  assert.equal(lines.length, 11)
})

test("空提示词会回退到自然模式", () => {
  assert.equal(resolveVideoPrompt(""), VIDEO_PROMPT_PRESETS.natural)
  assert.equal(resolveVideoPrompt("   "), VIDEO_PROMPT_PRESETS.natural)
})

test("模式二和模式三都保留 11 行自然动作描述", () => {
  assert.equal(VIDEO_PROMPT_PRESETS.mode2.split("\n").length, 11)
  assert.equal(VIDEO_PROMPT_PRESETS.mode3.split("\n").length, 11)
})
```

- [ ] **Step 2: 编写任务状态新增字段默认值与兼容恢复失败测试**

```typescript
import assert from "node:assert/strict"
import test from "node:test"

import { createNewTask, loadTask, saveTask } from "../lib/video-task-store.ts"
import { VIDEO_PROMPT_PRESETS } from "../lib/video/video-prompt-presets.ts"

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

test("新任务默认带自然模式提示词和模式标记", () => {
  const task = createNewTask()
  assert.equal(task.videoPromptMode, "natural")
  assert.equal(task.videoPrompt, VIDEO_PROMPT_PRESETS.natural)
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
  Object.defineProperty(globalThis, "window", { value: globalThis, configurable: true })
  Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true })

  const loaded = loadTask()

  assert.equal(loaded?.videoPromptMode, "natural")
  assert.equal(loaded?.videoPrompt, VIDEO_PROMPT_PRESETS.natural)
})
```

- [ ] **Step 3: 运行测试，确认当前实现失败**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-prompt-presets.test.ts tests/video-task-store.test.ts`

Expected:
- 先因为 `lib/video/video-prompt-presets.ts` 尚不存在而失败。
- 即便补出空文件，`VideoTaskState` 尚无 `videoPrompt` 与 `videoPromptMode` 字段，默认值断言也会失败。

- [ ] **Step 4: 提交失败测试基线**

```bash
git add tests/video-prompt-presets.test.ts tests/video-task-store.test.ts
git commit -m "test: add video prompt preset coverage"
```

### Task 2: 实现前端预设模块和任务持久化最小闭环

**Files:**
- Create: `f:\A-项目\13-中台网站\lib\video\video-prompt-presets.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video-task-store.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video\types.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video\api.ts`
- Test: `f:\A-项目\13-中台网站\tests\video-prompt-presets.test.ts`
- Test: `f:\A-项目\13-中台网站\tests\video-task-store.test.ts`

- [ ] **Step 1: 写最小预设模块实现**

```typescript
export const DEFAULT_VIDEO_PROMPT_MODE = "natural" as const

export type VideoPromptMode = "natural" | "mode2" | "mode3"

export const VIDEO_PROMPT_MODE_LABELS: Record<VideoPromptMode, string> = {
  natural: "自然模式",
  mode2: "模式二",
  mode3: "模式三",
}

export const VIDEO_PROMPT_PRESETS: Record<VideoPromptMode, string> = {
  natural: [
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，手部自然摆动，轻微皱眉",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，手部自然的摆动",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，手部自然的摆动",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，手部自然摆动，轻微皱眉",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，手部自然的摆动",
    "他对着镜头说话,嘴部脸部动作幅度小，表情自然，",
  ].join("\n"),
  mode2: [
    "他对着镜头说话，嘴部动作轻微，神情放松自然",
    "他对着镜头说话，轻轻点头，眼神稳定看向镜头",
    "他对着镜头说话，手部小幅度自然摆动，表情平和",
    "他对着镜头说话，微微抬眉，语气像在耐心解释",
    "他对着镜头说话，肩颈放松，嘴部动作自然克制",
    "他对着镜头说话，手指轻微带动，整体动作简洁",
    "他对着镜头说话，轻微停顿后继续表达，神态自然",
    "他对着镜头说话，轻轻点头，表情真诚不过度夸张",
    "他对着镜头说话，手部自然收放，动作连贯流畅",
    "他对着镜头说话，眉眼轻微变化，整体状态稳定",
    "他对着镜头说话，保持自然站姿，平稳完成表达",
  ].join("\n"),
  mode3: [
    "他对着镜头说话，表情自然，语气像在面对面交流",
    "他对着镜头说话，轻微点头，眼神里带一点回应感",
    "他对着镜头说话，手部轻轻向前带动，动作自然",
    "他对着镜头说话，嘴部动作清晰，神情温和稳定",
    "他对着镜头说话，微微皱眉，像在强调一个重点",
    "他对着镜头说话，手部自然摆动，节奏平缓不夸张",
    "他对着镜头说话，轻微停顿后继续，状态放松",
    "他对着镜头说话，轻轻点头，表情真诚自然",
    "他对着镜头说话，眉眼有细微变化，动作不过大",
    "他对着镜头说话，手部动作简洁，保持流畅交流感",
    "他对着镜头说话，整体神态从容，自然结束表达",
  ].join("\n"),
}

export function resolveVideoPrompt(value: string | undefined | null): string {
  return typeof value === "string" && value.trim() ? value : VIDEO_PROMPT_PRESETS[DEFAULT_VIDEO_PROMPT_MODE]
}
```

- [ ] **Step 2: 为任务状态增加默认字段并兼容旧数据**

```typescript
import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
  type VideoPromptMode,
} from "@/lib/video/video-prompt-presets"

export type VideoTaskState = {
  // ...
  videoPrompt: string
  videoPromptMode: VideoPromptMode
}

const DEFAULT_STATE: Omit<VideoTaskState, "taskId" | "createdAt" | "updatedAt"> = {
  // ...
  videoPrompt: VIDEO_PROMPT_PRESETS[DEFAULT_VIDEO_PROMPT_MODE],
  videoPromptMode: DEFAULT_VIDEO_PROMPT_MODE,
}

return {
  ...DEFAULT_STATE,
  ...parsed,
  videoPrompt: resolveVideoPrompt(typeof parsed.videoPrompt === "string" ? parsed.videoPrompt : ""),
  videoPromptMode:
    parsed.videoPromptMode === "mode2" || parsed.videoPromptMode === "mode3" || parsed.videoPromptMode === "natural"
      ? parsed.videoPromptMode
      : DEFAULT_VIDEO_PROMPT_MODE,
  // ...
}
```

- [ ] **Step 3: 扩展共享请求类型与 API 封装类型**

```typescript
import type { VideoPromptMode } from "./video-prompt-presets"

export type VideoGenerateRequest = {
  image_base64: string
  audio_base64: string
  script: string
  gender: VideoGender
  video_prompt?: string
  video_prompt_mode?: VideoPromptMode
  resolution?: string
  bg_color?: string
}
```

- [ ] **Step 4: 运行测试，确认新增默认值与兼容逻辑转绿**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-prompt-presets.test.ts tests/video-task-store.test.ts`

Expected:
- 两个测试文件全部 PASS。

- [ ] **Step 5: 提交前端预设与持久化基础设施**

```bash
git add lib/video/video-prompt-presets.ts lib/video-task-store.ts lib/video/types.ts lib/video/api.ts tests/video-prompt-presets.test.ts tests/video-task-store.test.ts
git commit -m "feat: add video prompt preset state"
```

### Task 3: 先写后端自定义提示词失败测试，再接入 FastAPI 与 RunningHub

**Files:**
- Modify: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`
- Modify: `f:\A-项目\13-中台网站\lib\runninghub_client.py`
- Modify: `f:\A-项目\13-中台网站\main.py`

- [ ] **Step 1: 为 FastAPI 自定义提示词透传写失败测试**

```python
@patch("main.asyncio.create_task")
@patch("main._cleanup_temp")
@patch("main._base64_to_temp_file", new_callable=AsyncMock)
@patch("main._get_rh_client")
def test_video_generate_uses_custom_video_prompt_when_provided(
    mock_get_rh_client,
    mock_base64_to_temp_file,
    _mock_cleanup_temp,
    mock_create_task,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    mock_base64_to_temp_file.side_effect = ["C:/tmp/input.png", "C:/tmp/input.mp3"]

    rh = SimpleNamespace(
        upload_file=AsyncMock(side_effect=["https://example.com/image.png", "https://example.com/audio.mp3"]),
        submit_audio_clone=AsyncMock(return_value="audio-clone-task"),
        wait_for_completion=AsyncMock(return_value={"results": [{"url": "https://example.com/audio-clone.mp3"}]}),
        submit_video=AsyncMock(return_value="video-task-123"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task

    req = main.VideoGenerateRequest(
        image_base64="aW1hZ2U=",
        audio_base64="YXVkaW8=",
        script="第一句\n第二句",
        gender="female",
        video_prompt="自定义第一行\n自定义第二行\n自定义第三行\n自定义第四行\n自定义第五行\n自定义第六行\n自定义第七行\n自定义第八行\n自定义第九行\n自定义第十行\n自定义第十一行",
        video_prompt_mode="mode2",
    )

    asyncio.run(main.video_generate(req))

    assert rh.submit_video.await_args.args[2].startswith("自定义第一行")
    stored = main._task_store["video-task-123"]
    assert stored["video_prompt_mode"] == "mode2"
    assert stored["video_prompt"].startswith("自定义第一行")
```

- [ ] **Step 2: 为空提示词回退自然模式写失败测试**

```python
def test_build_motion_prompt_falls_back_to_gender_default_when_custom_prompt_empty():
    prompt = main.build_motion_prompt("female", "")
    assert prompt.startswith("她对着镜头说话")
    assert len(prompt.splitlines()) == 11
```

- [ ] **Step 3: 运行后端测试，确认当前实现失败**

Run: `python -m pytest tests/test_video_postprocess.py -k "custom_video_prompt or build_motion_prompt_falls_back" -v`

Expected:
- 当前 `VideoGenerateRequest` 还没有 `video_prompt` / `video_prompt_mode` 字段，Pydantic 或断言会失败。
- 当前 `build_motion_prompt()` 只接受 `gender` 单参数，测试会失败。

- [ ] **Step 4: 最小化修改 RunningHub 客户端和 FastAPI 模型**

```python
class VideoGenerateRequest(BaseModel):
    image_base64: str
    audio_base64: str
    script: str
    gender: str = "female"
    video_prompt: str = ""
    video_prompt_mode: str = "natural"
    resolution: str = "720p"
    bg_color: str = ""


def build_motion_prompt(gender: str, custom_prompt: str = "") -> str:
    if custom_prompt and custom_prompt.strip():
        return custom_prompt.strip()
    pronoun = "她" if gender == "female" else "他"
    return (
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然摆动，轻微皱眉\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然摆动，轻微皱眉\n"
        f"{pronoun}对着镜头说话。\n"
        f"{pronoun}对着镜头说话，手部自然的摆动\n"
        f"{pronoun}对着镜头说话。\n"
    )
```

- [ ] **Step 5: 在视频生成流程中透传并落库最终提示词**

```python
motion_prompt = build_motion_prompt(req.gender, req.video_prompt)
video_task_id = await rh.submit_video(image_url, audio_clone_url, motion_prompt)

_task_store[video_task_id] = {
    "task_id": video_task_id,
    "status": "queued",
    # ...
    "script": req.script,
    "video_prompt": motion_prompt,
    "video_prompt_mode": req.video_prompt_mode or "natural",
    "image_url": image_url,
    "gender": req.gender,
    # ...
}
```

- [ ] **Step 6: 运行后端测试确认转绿**

Run: `python -m pytest tests/test_video_postprocess.py -k "custom_video_prompt or build_motion_prompt_falls_back or stores_default_postprocess_fields" -v`

Expected:
- 相关视频生成测试全部 PASS。

- [ ] **Step 7: 提交后端提示词透传**

```bash
git add main.py lib/runninghub_client.py tests/test_video_postprocess.py
git commit -m "feat: pass custom video prompt to runninghub"
```

### Task 4: 接上页面 UI、生成请求字段并完成回归

**Files:**
- Modify: `f:\A-项目\13-中台网站\components\video-creation-workflow.tsx`
- Modify: `f:\A-项目\13-中台网站\lib\video-task-store.ts`
- Modify: `f:\A-项目\13-中台网站\lib\video\video-prompt-presets.ts`
- Test: `f:\A-项目\13-中台网站\tests\video-prompt-presets.test.ts`
- Test: `f:\A-项目\13-中台网站\tests\video-task-store.test.ts`
- Test: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`

- [ ] **Step 1: 在组件中接入提示词状态别名和模式点击处理**

```tsx
import {
  DEFAULT_VIDEO_PROMPT_MODE,
  VIDEO_PROMPT_MODE_LABELS,
  VIDEO_PROMPT_PRESETS,
  resolveVideoPrompt,
  type VideoPromptMode,
} from "@/lib/video/video-prompt-presets"

const videoPrompt = taskState.videoPrompt
const videoPromptMode = taskState.videoPromptMode
const setVideoPrompt = (v: string) => updateTask({ videoPrompt: v })
const setVideoPromptMode = (v: VideoPromptMode) => updateTask({ videoPromptMode: v })

const applyVideoPromptPreset = React.useCallback((mode: VideoPromptMode) => {
  updateTask({
    videoPromptMode: mode,
    videoPrompt: VIDEO_PROMPT_PRESETS[mode],
  })
}, [updateTask])
```

- [ ] **Step 2: 在素材准备区插入“视频提示词”卡片**

```tsx
<div className="flex flex-col gap-3 rounded-2xl border border-slate-200/60 bg-white p-5 dark:border-white/10 dark:bg-white/5">
  <div className="flex items-center gap-2">
    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-500/10">
      <Sparkles className="h-4 w-4 text-rose-400" />
    </span>
    <div>
      <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">视频提示词</p>
      <p className="text-[11px] text-slate-400">用于控制数字人口播时的动作节奏，对应 RunningHub 254 节点</p>
    </div>
  </div>

  <div className="flex flex-wrap gap-2">
    {(Object.keys(VIDEO_PROMPT_MODE_LABELS) as VideoPromptMode[]).map((mode) => (
      <button
        key={mode}
        type="button"
        onClick={() => applyVideoPromptPreset(mode)}
        className={cn(
          "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
          videoPromptMode === mode
            ? "bg-rose-500 text-white"
            : "bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-white/5 dark:text-slate-300"
        )}
      >
        {VIDEO_PROMPT_MODE_LABELS[mode]}
      </button>
    ))}
  </div>

  <textarea
    rows={11}
    value={resolveVideoPrompt(videoPrompt)}
    onChange={(e) => setVideoPrompt(e.target.value)}
    className="min-h-[220px] w-full resize-none rounded-xl border border-slate-200/60 bg-slate-50/50 p-3 text-[13px] leading-relaxed text-slate-800"
  />
</div>
```

- [ ] **Step 3: 把当前文本框内容带入 FastAPI 生成请求**

```tsx
body: JSON.stringify({
  image_base64: imageBase64,
  audio_base64: audioBase64,
  script: script.trim(),
  gender,
  video_prompt: videoPrompt.trim(),
  video_prompt_mode: videoPromptMode,
})
```

- [ ] **Step 4: 运行定向测试与静态检查**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-prompt-presets.test.ts tests/video-task-store.test.ts`

Run: `python -m pytest tests/test_video_postprocess.py -k "video_generate or build_motion_prompt_falls_back" -v`

Run: `pnpm lint`

Expected:
- TS 单测 PASS。
- Python 定向测试 PASS。
- `pnpm lint` 不新增与本次改动直接相关的错误。

- [ ] **Step 5: 手工冒烟验证**

```bash
pnpm dev:all
```

Expected:
- 首次进入页面，“视频提示词”显示自然模式 11 行。
- 点击模式二、模式三时，文本框内容立即整段切换。
- 手动改一行后刷新页面，文本能从本地恢复。
- 点击“一键生成口播视频”时，请求体包含 `video_prompt` 和 `video_prompt_mode`。

- [ ] **Step 6: 提交 UI 与联调完成状态**

```bash
git add components/video-creation-workflow.tsx lib/video-task-store.ts lib/video/video-prompt-presets.ts lib/video/types.ts lib/video/api.ts tests/video-prompt-presets.test.ts tests/video-task-store.test.ts tests/test_video_postprocess.py
git commit -m "feat: add video prompt panel"
```

## 自检结果
- 规格覆盖：
  - 红框区域新增板块：由 Task 4 完成。
  - 默认自然模式、三模式切换、手动编辑：由 Task 2 + Task 4 完成。
  - 本地持久化与旧任务兼容：由 Task 1 + Task 2 完成。
  - FastAPI 与 RunningHub `254.inputs.text` 映射：由 Task 3 完成。
- 占位检查：
  - 计划中不允许把 `mode2` / `mode3` 留成注释实现；执行时必须用设计文档中的 11 行完整文本替换。
  - 其余步骤已给出明确文件、命令和代码骨架。
- 类型一致性：
  - 前端统一使用 `video_prompt` / `video_prompt_mode` 请求字段。
  - 前端状态统一使用 `videoPrompt` / `videoPromptMode`。
  - 后端请求模型与 `_task_store` 使用同一命名语义，避免传值与落库错位。
