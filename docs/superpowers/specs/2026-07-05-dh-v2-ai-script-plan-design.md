# 数字人视频创作（新）— AI 分镜脚本 + 多段成片

> 日期：2026-07-05  
> 状态：已批准实现

## 目标

移除 RH 分镜图管线，改为：

1. **创作配置** — 参考图、口播文案、视频创作想法、可选音频  
2. **分镜脚本** — AI 生成可编辑的文本分镜（视频提示词 / 分镜细节 / 角色台词）  
3. **生成中** — 每段 15s 并发提交 Seedance（aicost）→ ffmpeg 拼接  
4. **成片预览**

## 语速与拆段

| 规则 | 公式 |
|------|------|
| 字数 | 去掉空白后的字符数 |
| 时长区间 | `min = chars/3.3`，`max = chars/2.8`（秒，1 位小数） |
| 计划时长 | `max(15, ceil(chars/3.0/15)*15)` |
| 段数 | `planDuration / 15` |
| 台词切分 | 确定性均分字数预算，优先在 `。！？；\n` 处断句，保序 |

## 数据结构

### DhV2SegmentPlan

```typescript
{
  index: number
  time_range: string       // "0-15s", "15-30s"
  dialogue: string         // 本段台词（服务端切片覆盖 AI）
  shot_details: string     // 分镜细节
  video_prompt: string   // Seedance 提示词
}
```

### DhV2ScriptPlan

```typescript
{
  char_count: number
  duration_min: number
  duration_max: number
  plan_duration: number
  segment_count: number
  segments: DhV2SegmentPlan[]
}
```

## API

### POST `/api/dh-video-v2/plan-script`

**请求**

```json
{
  "script": "口播全文",
  "creative_idea": "视频创作想法",
  "image_count": 1,
  "has_audio_ref": false
}
```

**响应**

```json
{
  "plan": { /* DhV2ScriptPlan */ }
}
```

实现：TS 侧 `buildScriptPlanSkeleton()` 切分台词 → Python DeepSeek 填充 `shot_details` / `video_prompt` → 服务端用切片覆盖 `dialogue`。

### POST `/api/dh-video-v2/submit`

**请求**（扩展）

```json
{
  "provider": "seedance",
  "mode": "multimodal",
  "images_base64": ["data:image/..."],
  "audios_base64": [],
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "segments": [ /* DhV2SegmentPlan[] */ ],
  "client_task_id": "dhv2_xxx"
}
```

**响应**：`{ task_id, status }`

后台 `_run_dh_video_v2_pipeline`：`asyncio.gather` 每段 `submit_aicost_seedance` → 轮询 → 下载 → `concatenate_videos_ffmpeg`。

### GET `/api/dh-video-v2/status?taskId=`

**响应**

```json
{
  "task_id": "dhv2_xxx",
  "status": "processing",
  "progress": 45,
  "stage_label": "段 2/3 渲染中",
  "segment_count": 3,
  "segments_completed": 1,
  "video_url": ""
}
```

## 环境变量

| 变量 | 用途 |
|------|------|
| `SEEDANCE_API_KEY` | aicost Bearer（优先） |
| `SEEDANCE_BASE_URL` | 默认 `https://www.aicost.xyz` |
| `DEEPSEEK_API_KEY` | 分镜脚本 AI |

## 不改动

- [`components/promo-video-workflow.tsx`](../../components/promo-video-workflow.tsx) 宣传视频分镜图流程
