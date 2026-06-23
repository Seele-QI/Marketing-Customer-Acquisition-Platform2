# 视频封面图 RunningHub 生成 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为视频创作链路补齐基于 RunningHub `rhart-image-g-2/image-to-image` 的自动封面图生成与失败后手动重试机制，并确保封面失败不影响视频主任务成功。

**Architecture:** 继续沿用现有 `main.py -> RunningHubClient -> _task_store -> 前端轮询状态` 主链路，不新增抽帧逻辑。后端将视频主状态与封面状态解耦，封面图自动生成和手动重试都复用同一套 RunningHub 封面图提交与查询逻辑，前端只根据新增的 `cover_status / cover_error / cover_task_id / cover_url` 四组信息切换 UI 状态。

**Tech Stack:** Python, FastAPI, pytest, httpx, React, TypeScript

---

## 文件结构

### 需要修改
- `f:\A-项目\13-中台网站\lib\runninghub_client.py`
  - 负责封面图任务提交、错误透传和 RunningHub 请求体一致性。
- `f:\A-项目\13-中台网站\main.py`
  - 负责自动触发封面图、状态持久化、`/api/video/status` 返回值和 `/api/video/cover` 手动重试入口。
- `f:\A-项目\13-中台网站\components\video-creation-workflow.tsx`
  - 负责封面图 4 态 UI 与“重新生成封面”按钮交互。

### 需要新增
- `f:\A-项目\13-中台网站\tests\test_video_cover.py`
  - 覆盖 RunningHub 封面图 payload、自动封面图状态写入、失败不拖垮视频、手动重试接口。
- `f:\A-项目\13-中台网站\tests\video-cover-ui.test.ts`
  - 覆盖封面区域 `running / success / failed` 的状态映射与文案。

## 任务拆分

### Task 1: 为封面图自动生成与重试补齐失败测试

**Files:**
- Create: `f:\A-项目\13-中台网站\tests\test_video_cover.py`
- Create: `f:\A-项目\13-中台网站\tests\video-cover-ui.test.ts`
- Modify: `f:\A-项目\13-中台网站\lib\runninghub_client.py`
- Modify: `f:\A-项目\13-中台网站\main.py`
- Modify: `f:\A-项目\13-中台网站\components\video-creation-workflow.tsx`

- [ ] **Step 1: 编写 RunningHub 封面图请求 payload 失败测试**

```python
import asyncio
from unittest.mock import AsyncMock

from lib.runninghub_client import RunningHubClient


def test_submit_cover_image_uses_runninghub_image_to_image_payload():
    client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value.is_success = True
    http_client.post.return_value.json.return_value = {"taskId": "cover-task-1"}
    client._client = http_client

    task_id = asyncio.run(
        client.submit_cover_image(
            prompt="封面描述",
            image_urls=["https://example.com/input.png"],
            aspect_ratio="3:4",
            resolution="1k",
        )
    )

    assert task_id == "cover-task-1"
    called_json = http_client.post.call_args.kwargs["json"]
    assert called_json == {
        "prompt": "封面描述",
        "imageUrls": ["https://example.com/input.png"],
        "aspectRatio": "3:4",
        "resolution": "1k",
    }
```

- [ ] **Step 2: 运行单测，确认当前实现能被该用例约束**

Run: `python -m pytest tests/test_video_cover.py -k "image_to_image_payload" -v`

Expected:
- 若实现字段不一致或测试文件尚未存在，则先失败。

- [ ] **Step 3: 编写自动封面图状态写入与失败隔离测试**

```python
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import main


@patch("main._run_post_process", new_callable=AsyncMock)
@patch("main.asyncio.create_task")
@patch("main._get_rh_client")
def test_poll_video_task_marks_cover_running_and_success_without_breaking_video(
    mock_get_rh_client,
    mock_create_task,
    _mock_run_post_process,
):
    def _fake_create_task(coro):
        coro.close()
        return object()

    task_id = "video-task-cover-1"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "queued",
        "video_url": "",
        "image_url": "https://example.com/original.png",
        "gender": "female",
        "cover_url": "",
        "cover_status": "idle",
        "cover_error": "",
        "cover_task_id": "",
    }

    rh = SimpleNamespace(
        wait_for_completion=AsyncMock(
            side_effect=[
                {"results": [{"url": "https://example.com/video.mp4"}]},
                {"results": [{"url": "https://example.com/cover.png"}]},
            ]
        ),
        submit_cover_image=AsyncMock(return_value="cover-task-1"),
    )
    mock_get_rh_client.return_value = rh
    mock_create_task.side_effect = _fake_create_task

    asyncio.run(main._poll_video_task(task_id))

    stored = main._task_store[task_id]
    assert stored["status"] == "success" or stored["status"] == "post_processing"
    assert stored["cover_status"] == "success"
    assert stored["cover_url"] == "https://example.com/cover.png"
    assert stored["cover_task_id"] == "cover-task-1"
```

- [ ] **Step 4: 编写封面失败不拖垮视频与手动重试接口测试**

```python
from fastapi.testclient import TestClient
from unittest.mock import AsyncMock, patch
import main

client = TestClient(main.app)


@patch("main._get_rh_client")
def test_video_cover_retry_returns_cover_success_without_changing_video_failure(mock_get_rh_client):
    task_id = "video-task-cover-retry"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "success",
        "video_url": "https://example.com/video.mp4",
        "image_url": "https://example.com/original.png",
        "gender": "female",
        "cover_url": "",
        "cover_status": "failed",
        "cover_error": "cover failed",
        "cover_task_id": "",
    }

    rh = type("RH", (), {})()
    rh.submit_cover_image = AsyncMock(return_value="cover-task-retry")
    rh.wait_for_completion = AsyncMock(return_value={"results": [{"url": "https://example.com/cover-retry.png"}]})
    mock_get_rh_client.return_value = rh

    resp = client.post("/api/video/cover", json={"task_id": task_id, "gender": "female"})

    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["status"] == "success"
    assert data["cover_url"] == "https://example.com/cover-retry.png"
    assert main._task_store[task_id]["status"] == "success"
```

- [ ] **Step 5: 编写前端封面失败态显示测试**

```typescript
import assert from "node:assert/strict"
import test from "node:test"

import { getCoverUiState } from "../lib/video-cover-ui.ts"

test("封面失败时返回 failed 状态并显示重试文案", () => {
  const state = getCoverUiState({
    coverUrl: "",
    coverStatus: "failed",
    coverError: "封面生成失败",
    videoStatus: "success",
  })

  assert.equal(state.kind, "failed")
  assert.match(state.message, /封面生成失败/)
  assert.equal(state.allowRetry, true)
})
```

- [ ] **Step 6: 运行测试，确认当前实现失败**

Run: `python -m pytest tests/test_video_cover.py -v`

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-cover-ui.test.ts`

Expected:
- 至少 1 个后端封面图测试失败，因为当前 `_task_store` 尚无完整 `cover_status / cover_error / cover_task_id` 机制。
- 前端测试失败，因为当前还没有抽出的封面 UI 状态函数。

- [ ] **Step 7: 提交失败测试基线**

```bash
git add tests/test_video_cover.py tests/video-cover-ui.test.ts
git commit -m "test: cover runninghub cover-image flows"
```

### Task 2: 收紧 RunningHub 封面图客户端并补齐错误透传

**Files:**
- Modify: `f:\A-项目\13-中台网站\lib\runninghub_client.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_cover.py`

- [ ] **Step 1: 让 `submit_cover_image()` 的失败信息包含 `errorMessage`**

把当前：

```python
        if not resp.is_success:
            raise RunningHubError(
                f"封面生成任务提交失败 (HTTP {resp.status_code})",
                status_code=resp.status_code,
                response_body=resp.text[:1000],
            )
```

改成：

```python
        if not resp.is_success:
            error_message = ""
            try:
                body = resp.json()
                error_message = body.get("errorMessage", "") or body.get("message", "")
            except Exception:
                body = None
            raise RunningHubError(
                f"封面图生成任务提交失败 (HTTP {resp.status_code})"
                + (f": {error_message}" if error_message else ""),
                status_code=resp.status_code,
                response_body=(resp.text or "")[:1000],
            )
```

- [ ] **Step 2: 给缺少 `taskId` 的情况补一个明确错误测试**

```python
def test_submit_cover_image_raises_when_task_id_missing():
    client = RunningHubClient("test-api-key")
    http_client = AsyncMock()
    http_client.post.return_value.is_success = True
    http_client.post.return_value.text = '{"status":"RUNNING"}'
    http_client.post.return_value.json.return_value = {"status": "RUNNING"}
    client._client = http_client

    raised = False
    try:
        asyncio.run(
            client.submit_cover_image(
                prompt="封面描述",
                image_urls=["https://example.com/input.png"],
            )
        )
    except Exception as e:
        raised = True
        assert "taskId" in str(e)
    assert raised
```

- [ ] **Step 3: 运行客户端测试**

Run: `python -m pytest tests/test_video_cover.py -k "submit_cover_image" -v`

Expected: PASS

- [ ] **Step 4: 提交 RunningHub 客户端修复**

```bash
git add lib/runninghub_client.py tests/test_video_cover.py
git commit -m "fix: tighten runninghub cover image client"
```

### Task 3: 解耦视频主状态与封面图状态

**Files:**
- Modify: `f:\A-项目\13-中台网站\main.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_cover.py`

- [ ] **Step 1: 在视频任务初始化时补齐封面字段**

在 `video_generate()` 创建 `_task_store[video_task_id]` 时补充：

```python
            "cover_status": "idle",
            "cover_error": "",
            "cover_task_id": "",
```

- [ ] **Step 2: 抽一个统一的封面图执行函数**

在 `main.py` 中新增：

```python
async def _run_cover_generation(task_id: str, *, image_url: str, gender: str) -> str:
    stored = _task_store.get(task_id, {})
    rh = _get_rh_client()
    cover_prompt = build_cover_prompt(gender)
    cover_task_id = await rh.submit_cover_image(
        prompt=cover_prompt,
        image_urls=[image_url],
        aspect_ratio="3:4",
        resolution="1k",
    )
    _task_store[task_id] = {
        **_task_store.get(task_id, {}),
        "cover_status": "running",
        "cover_error": "",
        "cover_task_id": cover_task_id,
    }
    cover_result = await rh.wait_for_completion(cover_task_id, max_wait=300)
    cover_url = ""
    for item in cover_result.get("results", []):
        if item.get("url"):
            cover_url = item["url"]
            break
    if not cover_url:
        raise RuntimeError("封面图生成完成但未返回结果 URL")
    _task_store[task_id] = {
        **_task_store.get(task_id, {}),
        "cover_url": cover_url,
        "cover_status": "success",
        "cover_error": "",
    }
    return cover_url
```

- [ ] **Step 3: 在 `_poll_video_task()` 中复用该函数并保证失败不拖垮视频**

将当前直接写在 `_poll_video_task()` 里的封面图逻辑替换为：

```python
        if image_url and video_url:
            try:
                print(f"[cover] Auto-generating cover for task {task_id}")
                await _run_cover_generation(task_id, image_url=image_url, gender=gender)
            except Exception as e:
                _task_store[task_id] = {
                    **_task_store.get(task_id, {}),
                    "cover_status": "failed",
                    "cover_error": str(e),
                }
                print(f"[cover] Cover generation failed (non-blocking): {e}")
```

- [ ] **Step 4: 让 `video_status` 返回封面字段**

更新 `TaskStatusResponse`：

```python
class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress: int = 0
    video_url: str = ""
    audio_url: str = ""
    cover_url: str = ""
    cover_status: str = "idle"
    cover_error: str = ""
    cover_task_id: str = ""
    post_video_url: str = ""
```

并保证 `_task_store` 中已有这些键时能原样透出。

- [ ] **Step 5: 运行后端封面状态测试**

Run: `python -m pytest tests/test_video_cover.py -k "marks_cover_running or cover_retry" -v`

Expected: PASS

- [ ] **Step 6: 提交状态解耦改动**

```bash
git add main.py tests/test_video_cover.py
git commit -m "feat: track cover generation state separately"
```

### Task 4: 打通手动重试封面接口

**Files:**
- Modify: `f:\A-项目\13-中台网站\main.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_cover.py`

- [ ] **Step 1: 调整 `/api/video/cover` 让它优先使用任务存量数据**

把 `video_cover()` 改为：

```python
@app.post("/api/video/cover")
async def video_cover(req: CoverGenerateRequest):
    task_id = (req.task_id or "").strip()
    if not task_id:
        raise HTTPException(status_code=400, detail="缺少 task_id")

    stored = _task_store.get(task_id)
    if not stored:
        raise HTTPException(status_code=404, detail="视频任务不存在")

    image_url = (stored.get("image_url") or req.image_url or "").strip()
    if not image_url:
        raise HTTPException(status_code=400, detail="缺少 image_url，无法重试生成封面")

    gender = (stored.get("gender") or req.gender or "female").strip() or "female"
    cover_url = await _run_cover_generation(task_id, image_url=image_url, gender=gender)
    return {"cover_url": cover_url, "task_id": task_id, "status": "success"}
```

- [ ] **Step 2: 为“任务不存在 / 缺少原图”补错误用例**

```python
def test_video_cover_retry_returns_404_when_task_missing():
    resp = client.post("/api/video/cover", json={"task_id": "missing-task"})
    assert resp.status_code == 404


def test_video_cover_retry_returns_400_when_image_missing():
    task_id = "video-task-cover-missing-image"
    main._task_store[task_id] = {
        "task_id": task_id,
        "status": "success",
        "video_url": "https://example.com/video.mp4",
        "image_url": "",
        "gender": "female",
    }
    resp = client.post("/api/video/cover", json={"task_id": task_id})
    assert resp.status_code == 400
```

- [ ] **Step 3: 运行封面接口测试**

Run: `python -m pytest tests/test_video_cover.py -k "video_cover_retry" -v`

Expected: PASS

- [ ] **Step 4: 提交重试接口改动**

```bash
git add main.py tests/test_video_cover.py
git commit -m "feat: add cover image retry endpoint behavior"
```

### Task 5: 前端接入封面 4 态与重试按钮

**Files:**
- Create: `f:\A-项目\13-中台网站\lib\video-cover-ui.ts`
- Modify: `f:\A-项目\13-中台网站\components\video-creation-workflow.tsx`
- Test: `f:\A-项目\13-中台网站\tests\video-cover-ui.test.ts`

- [ ] **Step 1: 抽一个封面 UI 状态纯函数**

新建 `lib/video-cover-ui.ts`：

```typescript
export type CoverUiInput = {
  coverUrl: string
  coverStatus?: string
  coverError?: string
  videoStatus?: string
}

export type CoverUiState = {
  kind: "idle" | "running" | "success" | "failed"
  message: string
  allowRetry: boolean
}

export function getCoverUiState(input: CoverUiInput): CoverUiState {
  if (input.coverUrl) {
    return { kind: "success", message: "竖屏 3:4 封面图，可下载使用", allowRetry: false }
  }
  if (input.coverStatus === "running") {
    return { kind: "running", message: "封面图自动生成中...", allowRetry: false }
  }
  if (input.coverStatus === "failed") {
    return {
      kind: "failed",
      message: input.coverError || "封面生成失败，可重试",
      allowRetry: true,
    }
  }
  return { kind: "idle", message: "封面图尚未生成", allowRetry: false }
}
```

- [ ] **Step 2: 补齐前端纯函数测试**

在 `tests/video-cover-ui.test.ts` 中补充：

```typescript
test("封面成功时返回 success 状态", () => {
  const state = getCoverUiState({
    coverUrl: "https://example.com/cover.png",
    coverStatus: "success",
    coverError: "",
    videoStatus: "success",
  })

  assert.equal(state.kind, "success")
  assert.equal(state.allowRetry, false)
})
```

- [ ] **Step 3: 在 `video-creation-workflow.tsx` 接入封面状态字段**

新增从任务状态读取：

```tsx
  const coverStatus = taskState.coverStatus || "idle"
  const coverError = taskState.coverError || ""
  const coverUi = React.useMemo(() => getCoverUiState({
    coverUrl,
    coverStatus,
    coverError,
    videoStatus: status,
  }), [coverError, coverStatus, coverUrl, status])
```

并把当前封面文案：

```tsx
{coverUrl ? "竖屏 3:4 封面图，可下载使用" : "封面图自动生成中…"}
```

替换为：

```tsx
{coverUi.message}
```

- [ ] **Step 4: 增加“重新生成封面”按钮交互**

在组件内新增：

```tsx
  const handleRetryCover = React.useCallback(async () => {
    if (!taskId || coverRetryBusy) return
    setCoverRetryBusy(true)
    try {
      const res = await fetch(`${getFastapiBase()}/api/video/cover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "封面重试失败")
      updateTask({
        coverUrl: data.cover_url || "",
        coverStatus: "success",
        coverError: "",
      })
    } catch (error) {
      updateTask({
        coverStatus: "failed",
        coverError: error instanceof Error ? error.message : "封面重试失败",
      })
    } finally {
      setCoverRetryBusy(false)
    }
  }, [coverRetryBusy, taskId, updateTask])
```

并在封面区域条件渲染：

```tsx
{coverUi.allowRetry && (
  <Button type="button" variant="outline" onClick={handleRetryCover} disabled={coverRetryBusy}>
    {coverRetryBusy ? "重新生成中..." : "重新生成封面"}
  </Button>
)}
```

- [ ] **Step 5: 运行前端状态测试**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-cover-ui.test.ts`

Expected: PASS

- [ ] **Step 6: 提交前端封面状态改动**

```bash
git add lib/video-cover-ui.ts components/video-creation-workflow.tsx tests/video-cover-ui.test.ts
git commit -m "feat: add cover image retry ui states"
```

### Task 6: 做最终回归与交付核对

**Files:**
- Modify: `f:\A-项目\13-中台网站\docs\superpowers\plans\2026-06-17-cover-image-runninghub-implementation.md`

- [ ] **Step 1: 运行后端封面图测试总集**

Run: `python -m pytest tests/test_video_cover.py tests/test_video_postprocess.py -v`

Expected:
- PASS
- 不影响已有视频后处理回归测试

- [ ] **Step 2: 运行前端 Node 测试总集**

Run: `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-cover-ui.test.ts tests/video-task-runtime.test.ts tests/chat-stream-route.test.ts tests/copywriting-oral-script.test.ts`

Expected:
- PASS

- [ ] **Step 3: 人工验证自动封面图链路**

检查项：
- 视频成功后，封面区域先显示“封面图自动生成中...”
- 若 RunningHub 成功返回，封面图更新为真实图片
- `GET /api/video/status` 返回 `cover_status=success` 与 `cover_url`

- [ ] **Step 4: 人工验证封面失败与重试**

检查项：
- 人为让封面图任务失败后，视频结果仍保持可用
- 封面区域显示失败提示和“重新生成封面”
- 点击后重新进入运行态，再进入成功或失败态

- [ ] **Step 5: 记录计划执行结果**

把本计划文件末尾补充：

```md
## Execution Notes
- 自动封面图：通过 / 未通过
- 手动重试：通过 / 未通过
- 剩余问题：无 / 列表
```

- [ ] **Step 6: 最终提交**

```bash
git add lib/runninghub_client.py main.py components/video-creation-workflow.tsx lib/video-cover-ui.ts tests/test_video_cover.py tests/video-cover-ui.test.ts docs/superpowers/plans/2026-06-17-cover-image-runninghub-implementation.md
git commit -m "feat: stabilize runninghub cover image generation"
```

## 计划自检
- 规格覆盖：
  - 自动封面生成：Task 1、Task 2、Task 3
  - 失败不影响视频：Task 1、Task 3、Task 6
  - 手动重试：Task 1、Task 4、Task 5
  - 前端 4 态：Task 1、Task 5
  - RunningHub 请求字段一致性：Task 1、Task 2
- 占位词检查：
  - 未使用 `TODO`、`TBD`、`implement later` 等占位词
- 类型与签名一致性：
  - 计划内统一采用 `_run_cover_generation(task_id, *, image_url, gender)` 作为后端封面执行入口
  - 前端统一采用 `getCoverUiState({ coverUrl, coverStatus, coverError, videoStatus })` 作为封面状态推导入口

## Execution Notes
- 自动封面图：通过。后端已在 `main.py` 中解耦视频主状态与封面状态，并通过 `tests/test_video_cover.py` 验证自动生成成功与失败隔离。
- 手动重试：通过。`POST /api/video/cover` 已复用任务存量 `image_url` 和 `gender`，前端已接入“重新生成封面”按钮与 `running / success / failed` 四态。
- 自动化测试：
  - `python -m pytest tests/test_video_cover.py tests/test_video_postprocess.py -v`
  - `node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/video-cover-ui.test.ts tests/video-task-runtime.test.ts tests/chat-stream-route.test.ts tests/copywriting-oral-script.test.ts`
- 结果摘要：
  - Python：`14 passed`
  - Node：`19 passed`
- 诊断检查：
  - `main.py`
  - `lib/runninghub_client.py`
  - `lib/video-task-store.ts`
  - `lib/video-cover-ui.ts`
  - `components/video-creation-workflow.tsx`
  - 以上文件均无新增诊断错误。
- 剩余问题：
  - 未做浏览器内真实 RunningHub 联网人工回归；当前以接口级和状态级测试为主。
