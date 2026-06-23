# 视频剪辑问题修复（方案 B）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前真实在用的 Python + FFmpeg 剪辑链路中的 BGM 缺失、成片时长错误、字幕节奏不合理、字幕标点残留和画面滤镜约束问题，并同时覆盖自动链路与手动链路。

**Architecture:** 继续沿用 `main.py -> lib/video_postprocess.py -> FFmpeg` 这条后处理主链路，不引入 ASR。通过先补测试、再收敛字幕清洗与时间轴算法、再统一自动/手动链路的 BGM 与目标时长参数透传，最后补充回归验证，确保两条链路使用同一套行为。

**Tech Stack:** Python, FastAPI, pytest, FFmpeg/FFprobe, asyncio

---

## 文件结构

### 需要修改
- `f:\A-项目\13-中台网站\lib\video_postprocess.py`
  - 负责字幕文本清洗、字幕时间轴生成、FFmpeg 命令组装、音频混音和最终导出。
- `f:\A-项目\13-中台网站\main.py`
  - 负责自动后处理与手动剪辑任务的参数透传和任务状态管理。

### 需要新增
- `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`
  - 覆盖字幕清洗、时间轴总长、BGM 混音命令、无滤镜约束和自动链路参数透传。

## 任务拆分

### Task 1: 为后处理问题补齐失败测试

**Files:**
- Create: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`
- Modify: `f:\A-项目\13-中台网站\lib\video_postprocess.py`
- Modify: `f:\A-项目\13-中台网站\main.py`

- [ ] **Step 1: 编写字幕清洗与时间轴失败测试**

```python
import os
from pathlib import Path

from lib.video_postprocess import _clean_subtitle_text, create_timeline_by_chars


def test_clean_subtitle_text_removes_punctuation():
    cleaned = _clean_subtitle_text("你好，世界。/AI字幕！")
    assert cleaned == "你好世界AI字幕"


def test_timeline_total_duration_matches_target():
    timeline = create_timeline_by_chars("第一句。\n第二句更长一点。", 40.0)
    assert timeline
    assert float(timeline[-1]["end"]) == 40.0
    total = sum(float(item["duration"]) for item in timeline)
    assert round(total, 3) == 40.0
```

- [ ] **Step 2: 运行测试，确认当前实现失败**

Run: `python -m pytest tests/test_video_postprocess.py -k "clean_subtitle_text_removes_punctuation or timeline_total_duration_matches_target" -v`

Expected:
- `test_clean_subtitle_text_removes_punctuation` 失败，因为当前 `_clean_subtitle_text()` 仍保留中文标点。
- 若时间轴总长未精确累计，也允许该用例暴露当前边界问题。

- [ ] **Step 3: 补充 BGM 与无滤镜约束的失败测试**

```python
from unittest.mock import patch

from lib.video_postprocess import burn_subtitle_ffmpeg


@patch("lib.video_postprocess._run_ffmpeg")
@patch("lib.video_postprocess.has_audio_stream", return_value=True)
@patch("lib.video_postprocess._pick_bgm", return_value="C:/bgm/demo.mp3")
@patch("lib.video_postprocess.probe_resolution", return_value=(576, 1024))
def test_burn_subtitle_ffmpeg_uses_bgm_mix_and_no_visual_filters(
    _probe_resolution,
    _pick_bgm,
    _has_audio_stream,
    mock_run_ffmpeg,
    tmp_path,
):
    output_path = tmp_path / "final.mp4"
    ass_path = tmp_path / "demo.ass"
    ass_path.write_text("dummy", encoding="utf-8")
    mock_run_ffmpeg.return_value.returncode = 0
    mock_run_ffmpeg.return_value.stderr = ""
    output_path.write_bytes(b"ok")

    burn_subtitle_ffmpeg(
        "C:/video/input.mp4",
        str(ass_path),
        str(output_path),
        40.0,
        business_card_text="",
        bgm_dir="C:/bgm",
        preset="smooth",
        bgm_volume=0.32,
    )

    cmd = mock_run_ffmpeg.call_args.args[0]
    cmd_text = " ".join(cmd)
    assert "amix=inputs=2" in cmd_text
    assert "subtitles=" in cmd_text
    assert "drawtext=" not in cmd_text
    assert "eq=" not in cmd_text
    assert "curves=" not in cmd_text
    assert "boxblur=" not in cmd_text
```

- [ ] **Step 4: 运行测试，确认约束在当前代码下未完全覆盖**

Run: `python -m pytest tests/test_video_postprocess.py -k "bgm_mix_and_no_visual_filters" -v`

Expected:
- 在当前代码中可能部分通过，但如果命令未稳定包含 BGM 或滤镜链不够显式，该用例会暴露行为不清晰的问题。

- [ ] **Step 5: 补充自动链路参数透传失败测试**

```python
from unittest.mock import AsyncMock, patch

import main


@patch("main.asyncio.to_thread", new_callable=AsyncMock)
@patch("main.httpx.AsyncClient")
async def test_run_post_process_passes_bgm_related_arguments(mock_client_cls, mock_to_thread, tmp_path):
    task_id = "task-123"
    main._task_store[task_id] = {
        "task_id": task_id,
        "script": "第一句\n第二句",
        "bgm_dir": "bgm/smooth",
        "bgm_volume": 0.25,
        "preset": "smooth",
    }

    mock_client = mock_client_cls.return_value.__aenter__.return_value
    mock_response = type("Resp", (), {"content": b"video", "raise_for_status": lambda self: None})()
    mock_client.get = AsyncMock(return_value=mock_response)

    await main._run_post_process(task_id, "https://example.com/video.mp4")

    args = mock_to_thread.call_args.args
    assert args[0].__name__ == "run_ffmpeg_post_process"
    assert args[5] is True
    assert args[6] == ""
    assert args[7] == "bgm/smooth"
    assert args[8] == "smooth"
    assert args[9] == 0.25
```

- [ ] **Step 6: 运行自动链路参数透传测试，确认当前实现失败**

Run: `python -m pytest tests/test_video_postprocess.py -k "passes_bgm_related_arguments" -v`

Expected:
- FAIL，因为当前 `_run_post_process()` 只传了 6 个位置参数，没有透传 `bgm_dir / preset / bgm_volume`。

- [ ] **Step 7: 提交测试基线**

```bash
git add tests/test_video_postprocess.py
git commit -m "test: cover video postprocess regression cases"
```

### Task 2: 修复字幕清洗与时间轴算法

**Files:**
- Modify: `f:\A-项目\13-中台网站\lib\video_postprocess.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`

- [ ] **Step 1: 先最小修改字幕清洗规则**

将当前：

```python
_SUBTITLE_ALLOWED_RE = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff\s]+")
```

与：

```python
def _clean_subtitle_text(text: str) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = _SUBTITLE_ALLOWED_RE.sub("", text)
    return re.sub(r"\s+", " ", text).strip()
```

改成：

```python
_SUBTITLE_ALLOWED_RE = re.compile(r"[^0-9A-Za-z\u4e00-\u9fff\s]+")
_SUBTITLE_BREAK_RE = re.compile(r"[，。！？；：、,.!?:;/\r\n]+")


def _clean_subtitle_text(text: str) -> str:
    text = re.sub(r"\s+", " ", (text or "").strip())
    text = _SUBTITLE_ALLOWED_RE.sub("", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()
```

- [ ] **Step 2: 运行清洗测试，确认通过**

Run: `python -m pytest tests/test_video_postprocess.py -k "clean_subtitle_text_removes_punctuation" -v`

Expected: PASS

- [ ] **Step 3: 引入更稳定的字幕分段函数**

在 `lib/video_postprocess.py` 中新增：

```python
def split_script_segments(script: str) -> list[str]:
    raw = (script or "").replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = [part.strip() for part in raw.split("\n") if part.strip()]
    segments: list[str] = []
    for paragraph in paragraphs:
        pieces = [piece.strip() for piece in _SUBTITLE_BREAK_RE.split(paragraph) if piece.strip()]
        segments.extend(pieces)
    return [_clean_subtitle_text(piece) for piece in segments if _clean_subtitle_text(piece)]
```

- [ ] **Step 4: 重写时间轴分配逻辑，确保总时长精确对齐**

将 `create_timeline_by_chars()` 的输入改为基于 `split_script_segments()`，核心实现替换为：

```python
def create_timeline_by_chars(script: str, duration: float) -> list[dict[str, float | str]]:
    lines = split_script_segments(script)
    if not lines:
        return []

    weights: list[float] = []
    for line in lines:
        char_count = len(line.replace(" ", ""))
        weight = max(1.0, char_count * 1.0)
        if char_count <= 6:
            weight += 1.4
        elif char_count >= 18:
            weight += 2.0
        weights.append(weight)

    total_weight = sum(weights)
    allocated: list[float] = []
    remaining = float(duration)
    for idx, weight in enumerate(weights):
        if idx == len(weights) - 1:
            piece_duration = max(0.6, round(remaining, 3))
        else:
            piece_duration = round(duration * (weight / total_weight), 3)
            piece_duration = max(0.8, min(piece_duration, 6.5))
            remaining -= piece_duration
        allocated.append(piece_duration)

    total_allocated = round(sum(allocated), 3)
    delta = round(duration - total_allocated, 3)
    allocated[-1] = round(max(0.8, allocated[-1] + delta), 3)

    timeline: list[dict[str, float | str]] = []
    cursor = 0.0
    for idx, line in enumerate(lines):
        start = round(cursor, 3)
        end = round(cursor + allocated[idx], 3)
        timeline.append({
            "start": start,
            "duration": round(allocated[idx], 3),
            "end": end,
            "text": line,
        })
        cursor = end

    timeline[-1]["end"] = round(duration, 3)
    timeline[-1]["duration"] = round(duration - float(timeline[-1]["start"]), 3)
    return timeline
```

- [ ] **Step 5: 运行时间轴相关测试**

Run: `python -m pytest tests/test_video_postprocess.py -k "timeline_total_duration_matches_target" -v`

Expected: PASS

- [ ] **Step 6: 提交字幕与时间轴修复**

```bash
git add lib/video_postprocess.py tests/test_video_postprocess.py
git commit -m "fix: improve subtitle cleanup and timeline allocation"
```

### Task 3: 修复 BGM 混音与目标时长控制

**Files:**
- Modify: `f:\A-项目\13-中台网站\lib\video_postprocess.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`

- [ ] **Step 1: 抽出统一目标时长函数**

在 `lib/video_postprocess.py` 中新增：

```python
def resolve_target_duration(input_video_path: str) -> float:
    audio_duration = probe_audio_duration(input_video_path)
    if audio_duration and audio_duration > 0:
        return round(audio_duration, 3)
    return round(probe_duration(input_video_path), 3)
```

并将：

```python
duration = probe_audio_duration(input_video_path)
```

替换为：

```python
duration = resolve_target_duration(input_video_path)
```

- [ ] **Step 2: 显式记录 BGM 选取结果**

在 `burn_subtitle_ffmpeg()` 内增加：

```python
debug_dir = os.path.dirname(output_path)
Path(os.path.join(debug_dir, "ffmpeg_bgm_choice.txt")).write_text(
    bgm_path or "NO_BGM_SELECTED",
    encoding="utf-8",
)
```

- [ ] **Step 3: 明确 BGM 混音只影响音频，不改变视频滤镜链**

保留视频滤镜链结构：

```python
ass_filter = f"subtitles='{_escape_filter_path(ass_path)}'"
filters = [ass_filter]
if business_card_text:
    ...
vf = ",".join(filters)
```

不要加入任何调色或增强滤镜；并将音频混音命令固定保持：

```python
fc = (
    f"[0:a]volume={audio_volume:.2f},atrim=0:{duration:.3f},apad=whole_dur={duration:.3f},aresample=48000,"
    "aformat=sample_fmts=fltp:channel_layouts=stereo[voice];"
    f"[1:a]atrim=0:{duration:.3f},aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,"
    f"volume={bgm_volume:.2f},afade=t=in:st=0:d=1,afade=t=out:st={max(0, duration - 2):.3f}:d=2[music];"
    "[voice][music]amix=inputs=2:duration=first:dropout_transition=0[aout]"
)
```

- [ ] **Step 4: 补充目标时长与 BGM 行为测试**

在 `tests/test_video_postprocess.py` 增加：

```python
from lib.video_postprocess import resolve_target_duration


def test_resolve_target_duration_prefers_audio_duration(monkeypatch):
    monkeypatch.setattr("lib.video_postprocess.probe_audio_duration", lambda _: 40.0)
    monkeypatch.setattr("lib.video_postprocess.probe_duration", lambda _: 55.0)
    assert resolve_target_duration("demo.mp4") == 40.0
```

- [ ] **Step 5: 运行后处理测试集**

Run: `python -m pytest tests/test_video_postprocess.py -v`

Expected:
- PASS
- 不再出现 BGM 相关断言失败
- 不再出现滤镜约束断言失败

- [ ] **Step 6: 提交 BGM 与目标时长修复**

```bash
git add lib/video_postprocess.py tests/test_video_postprocess.py
git commit -m "fix: align output duration and bgm mixing behavior"
```

### Task 4: 统一自动链路与手动链路的后处理参数透传

**Files:**
- Modify: `f:\A-项目\13-中台网站\main.py`
- Test: `f:\A-项目\13-中台网站\tests\test_video_postprocess.py`

- [ ] **Step 1: 在自动任务状态中保存后处理所需字段**

在 `POST /api/video/generate` 创建 `_task_store[video_task_id]` 时补充：

```python
        "preset": "smooth",
        "bgm_dir": "",
        "bgm_volume": 0.32,
        "business_card_text": "",
```

- [ ] **Step 2: 修改 `_run_post_process()` 透传完整参数**

把当前：

```python
        result = await asyncio.to_thread(
            run_ffmpeg_post_process,
            task_id,
            input_path,
            base_dir,
            stored.get("script", ""),
            True,
        )
```

替换为：

```python
        result = await asyncio.to_thread(
            run_ffmpeg_post_process,
            task_id,
            input_path,
            base_dir,
            stored.get("script", ""),
            True,
            stored.get("business_card_text", ""),
            stored.get("bgm_dir", ""),
            stored.get("preset", "smooth"),
            stored.get("bgm_volume", 0.32),
        )
```

- [ ] **Step 3: 保持手动链路与自动链路参数顺序一致**

检查 `_run_edit_job()` 中以下调用顺序保持一致：

```python
            result = await asyncio.to_thread(
                run_ffmpeg_post_process,
                task_id,
                input_path,
                output_dir,
                req.subtitle_text,
                True,
                business_card_text,
                bgm_dir,
                req.preset,
                bgm_volume,
            )
```

如有顺序差异，统一改成与自动链路完全一致的参数布局。

- [ ] **Step 4: 运行参数透传与现有 Python 测试**

Run: `python -m pytest tests/test_video_postprocess.py tests/test_auth.py tests/test_credit.py -v`

Expected:
- 新增视频后处理测试 PASS
- 现有认证/积分测试继续 PASS

- [ ] **Step 5: 提交链路透传修复**

```bash
git add main.py tests/test_video_postprocess.py
git commit -m "fix: pass consistent postprocess args across video flows"
```

### Task 5: 做最终人工回归与交付核对

**Files:**
- Modify: `f:\A-项目\13-中台网站\docs\superpowers\plans\2026-06-17-video-editing-fixes-implementation.md`

- [ ] **Step 1: 启动前后端开发服务**

Run: `python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload`

Run: `set NODE_OPTIONS=--import ./scripts/dev-fix.mjs && pnpm dev:all`

Expected:
- 前端可打开 `http://localhost:3000`
- 后端接口可访问 `http://127.0.0.1:8000/docs`

- [ ] **Step 2: 手动验证自动链路**

检查项：
- 生成后自动后处理产物存在 `ffmpeg_bgm_choice.txt`
- 若存在可用 BGM，文件中不是 `NO_BGM_SELECTED`
- 最终导出视频时长与主音轨时长一致
- 字幕不包含 `/`、`，`、`。`

- [ ] **Step 3: 手动验证上传剪辑链路**

操作：
- 进入“视频创作”页的剪辑调试模式
- 上传一个带口播音频的样例视频
- 执行剪辑

检查项：
- 输出视频存在 BGM
- 字幕内容只有文字，不带标点
- 画面没有调色、没有磨皮、没有模糊

- [ ] **Step 4: 记录计划执行结果**

把本计划文件顶部或末尾补充一段执行结果摘要：

```md
## Execution Notes
- 自动链路：通过 / 未通过
- 手动链路：通过 / 未通过
- 剩余问题：无 / 列表
```

- [ ] **Step 5: 最终提交**

```bash
git add lib/video_postprocess.py main.py tests/test_video_postprocess.py docs/superpowers/plans/2026-06-17-video-editing-fixes-implementation.md
git commit -m "fix: stabilize video postprocess output"
```

## 计划自检
- 规格覆盖：
  - BGM 修复：Task 1、Task 3、Task 4
  - 时长修复：Task 1、Task 3
  - 字幕对齐算法改良：Task 1、Task 2
  - 字幕去标点：Task 1、Task 2
  - 禁止画面滤镜：Task 1、Task 3
  - 自动链路与手动链路统一：Task 4、Task 5
- 占位词检查：
  - 未使用 `TODO`、`TBD`、`implement later` 等占位词
- 类型与签名一致性：
  - 计划内统一采用 `run_ffmpeg_post_process(task_id, input_video_path, output_dir, script, keep_original, business_card_text, bgm_dir, preset, bgm_volume)` 的参数顺序

## Execution Notes
- 自动链路：未做真实 RunningHub 出片回归；已通过 `tests/test_video_postprocess.py` 中自动链路参数透传测试覆盖关键后处理入口。
- 手动链路：接口已实际跑通到剪辑入口，`/api/video/manual-upload` 和 `/api/video/manual-edit` 可返回有效任务；本地人工回归在媒体探测阶段被运行环境阻塞。
- 运行环境阻塞：当前机器无系统 `ffprobe`，仓库 `tools/ffmpeg/bin` 下也仅有 `ffmpeg.exe`，导致真实手动剪辑任务报 `[WinError 2] 系统找不到指定的文件`，无法在本机完成最终成片级人工验证。
- 已验证通过：`python -m pytest tests/test_video_postprocess.py tests/test_auth.py tests/test_credit.py -v`，结果 `32 passed`。
- 前后端连通性：`http://127.0.0.1:8000/docs` 返回 `200`，`http://localhost:3000` 返回 `200`。
- 剩余问题：需补齐可用 `ffprobe` 运行环境后，才能完成最终的本机成片级人工回归。
