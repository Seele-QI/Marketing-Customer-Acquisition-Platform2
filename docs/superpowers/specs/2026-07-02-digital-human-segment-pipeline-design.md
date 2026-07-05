# 数字人分段视频管线设计规格

**日期：** 2026-07-02  
**状态：** Phase 1 底层工具 + RH 客户端（Phase 2+ 待实施）  
**范围：** 数字人口播从单次 RH 工作流改为「20s 音频切段 → 并发 n 次 RH → ffmpeg 拼接 → 半成品预览 → 用户手动自动剪辑」

## 背景与目标

当前链路（`main.py` `video_generate` → `runninghub_client.submit_video`）单次提交 Workflow `2040243235951484930`，11 行 `motion_prompt`，RH 内部完成多段口播后返回一个 mp4，随后 `_poll_video_task` **自动**触发 `_run_post_process`。

目标行为：

```mermaid
flowchart LR
  clone[音频克隆完成] --> split[ffmpeg按20s切段]
  split --> upload[上传n段音频到RH]
  upload --> parallel[并发提交n个RH任务]
  parallel --> poll[轮询n个taskId]
  poll --> download[下载n个mp4]
  download --> concat[ffmpeg顺序拼接]
  concat --> preview[status=success展示半成品]
  preview --> edit[用户点击自动剪辑]
  edit --> postprocess[现有/api/video/edit流程]
```

**已确认参数：**

| 参数 | 值 |
|------|-----|
| 新 Workflow ID | `2072599683289141249` |
| 节点映射 | `221` image / `238` audio / `254` text（不变） |
| 每段提示词 | **5 行**（原 11 行） |
| 切段时长 | 20 秒 |
| 最大段数 | 30（约 10 分钟音频） |

## 方案选择

| 方案 | 描述 | 结论 |
|------|------|------|
| A. 最小补丁 | 以 RH taskId 为 key，batch 信息塞子字段 | 取消/轮询混乱 |
| **B. Promo 式批处理** | 以 `local_task_id`（`vg_*`）为主键，后台 `_run_dh_segment_pipeline` | **推荐** |
| C. 全异步 generate | 连克隆也移入后台 worker | 超出 MVP |

## 架构设计

### 1. 任务身份与存储（Phase 2）

- `_task_store` 主键改为 `local_task_id`（`vg_{ts}_{rand}`）
- `video_generate` 响应 `task_id` 返回 `local_task_id`
- batch 字段：

```python
segment_count: int
segments_completed: int
segment_duration_sec: int = 20
rh_video_task_ids: list[str]
segment_paths: list[str]  # 内部用
concat_stage: str  # idle | running | done | failed
```

- 扩展 `TaskStatusResponse`：`segment_count`, `segments_completed`

### 2. RH 工作流层 — `lib/runninghub_client.py`（Phase 1 ✅）

| 变更 | 说明 |
|------|------|
| `VIDEO_WORKFLOW_ID` | → `2072599683289141249` |
| `MOTION_PROMPT_LINE_COUNT` | `11` → `5` |
| `_default_motion_prompt` | 裁剪为 5 行 |
| `build_motion_prompt` | 校验 5 行 |
| `submit_video` | docstring 更新；`instanceType` 默认 `default`，可通过 `RH_VIDEO_INSTANCE_TYPE` 覆盖为 `plus` |

### 3. 音频切段 — `lib/video_audio_split.py`（Phase 1 ✅）

```python
SEGMENT_DURATION_SEC = 20
MAX_DH_SEGMENTS = 30

def plan_segment_count(audio_duration_sec: float) -> int
def split_audio_segments(input_path, output_dir, segment_sec=20.0, *, ffmpeg_exe=None) -> list[tuple[int, str]]
```

- 用 `probe_audio_duration` 获取真实时长
- ffmpeg：`-ss {i*20} -t 20`（末段取剩余时长）
- 输出：`segment_{idx:03d}.mp3`
- 超出 `MAX_DH_SEGMENTS` 抛出 `SegmentLimitExceeded`

### 4. 视频拼接 — `lib/video_concat.py`（Phase 1 ✅）

从 `promo_video_service.concatenate_videos_ffmpeg` 抽取，promo 与数字人管线共用。

拼接时机：n 段 RH 全部 SUCCESS 且下载完成后；失败任一段则整批 `failed`。

产物路径：`{DATA_DIR}/video-cache/generated/{local_task_id}/concat.mp4`

### 5. 主管线 — `main.py`（Phase 2）

**改造 `video_generate`：**

1. 保留：鉴权、积分、base64 解码、上传形象图+参考音色、**同步等待音频克隆**
2. 新增：下载克隆音频 → `split_audio_segments` → 逐段上传 RH
3. `asyncio.gather` 并发 `submit_video(image_url, segment_audio_url, motion_prompt_5lines)`
4. 写入 `_task_store[local_task_id]`，`asyncio.create_task(_run_dh_segment_pipeline(local_task_id))`
5. 返回 `TaskStatusResponse(task_id=local_task_id, ...)`

**新增 `_run_dh_segment_pipeline`：**

| 进度 | 阶段 |
|------|------|
| 0–10% | 已提交 |
| 10–85% | `segments_completed / segment_count` |
| 85–95% | ffmpeg concat |
| 100% | success，`video_url` 写入 |

- **不再调用** `_run_post_process`（用户手动进入自动剪辑）
- 封面：concat 成功后非阻塞触发 `_run_cover_generation`（可选）

**改造 `video_status` / `video_cancel`：** 均以 `local_task_id` 为 key

### 6. 前端（Phase 2）

| 变更 | 说明 |
|------|------|
| 轮询 key | 使用 `local_task_id`（`vg_*`） |
| 进度 UI | 「视频生成中 (3/9)」 |
| 完成态 | `success` + `video_url`，无 `post_processing` |
| 自动剪辑 | 保持 `POST /api/video/edit` |
| 提示词预设 | `video-prompt-presets.ts` 各裁为 5 行 |

## MVP 边界（明确不做）

- 不把音频克隆移入全异步 worker
- 不为每段自动生成不同提示词
- 不引入 xfade 转场（`-c copy` concat）
- 不改造图文视频 / 混剪 / 推广视频模块

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| RH 并发限流 | MVP 全并发；可加 `asyncio.Semaphore(5)` |
| generate 仍阻塞克隆 ≤10min | 接受；后续迭代 |
| `_task_store` 内存丢失 | 与现网一致 |
| 24h RH URL 过期 | concat 后立即下载到 `video-cache/generated` |
| 积分只扣一次 | `ref_id=local_task_id`，n 段不重复扣费 |

## 实施顺序

| Phase | 内容 | 状态 |
|-------|------|------|
| 1 | Spec + `video_audio_split` + `video_concat` + RH 客户端 + 单测 | ✅ 本规格 |
| 2 | `main.py` 管线 + status/cancel + TaskStatusResponse | 待实施 |
| 3 | 前端 preset 5 行 + 分段进度 UI | 待实施 |
| 4 | 端到端验证 + CLAUDE.md 更新 | 待实施 |

## 测试（Phase 1）

| 文件 | 用例 |
|------|------|
| `tests/test_video_audio_split.py` | `plan_segment_count(180)→9`；`plan_segment_count(15)→1`；段数上限 |
| `tests/test_video_concat.py` | concat 单段/多段（mock subprocess） |
| `tests/test_video_postprocess.py` | `build_motion_prompt` 5 行校验 |

## 验收标准（Phase 1）

- [x] 设计规格文档落盘
- [x] `lib/video_audio_split.py` 与单测通过
- [x] `lib/video_concat.py` 抽取与单测通过
- [x] `runninghub_client` workflow ID、5 行 prompt、env instanceType
- [ ] Phase 2：`video_generate` 改造 + 分段管线端到端
