# 视频生成接口文档（seedance2.0 / seedance2.0-fast / xinghe-2.0）

## 基础信息

基础地址：

```text
https://www.aicost.xyz
```

提交任务：

```http
POST /v1/videos
```

完整地址：

```text
https://www.aicost.xyz/v1/videos
```

请求头：

```http
Authorization: Bearer sk-xxxxxxxx
Content-Type: application/json
```

接口采用异步任务模式。提交后返回任务 ID，客户端用任务 ID 查询状态；任务完成后返回平台视频地址，下载接口直接返回 mp4 文件流。

## 模型

| 模型 | model |
| --- | --- |
| Seedance 2.0 | `seedance2.0` |
| Seedance 2.0 Fast | `seedance2.0-fast` |
| Xinghe 2.0 | `xinghe-2.0` |

`seedance2.0` 和 `seedance2.0-fast` 的素材入参、开放模式一致。`seedance2.0` 支持 4-15 秒，`seedance2.0-fast` 固定 15 秒。两者只开放参考图生视频、首帧+参考图生视频，不开放文生视频、单首帧、首尾帧模式。

## 请求参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | `seedance2.0`、`seedance2.0-fast` 或 `xinghe-2.0` |
| `prompt` | string | 是 | 视频生成提示词 |
| `aspect_ratio` | string | 否 | Seedance 支持 `auto`、`16:9`、`9:16`、`1:1`；Xinghe 支持 `16:9`、`9:16` |
| `ratio` | string | 否 | 同 `aspect_ratio` |
| `resolution` | string | 否 | 固定传 `720p` |
| `resolution_name` | string | 否 | 同 `resolution` |
| `duration` | string \| number | 否 | `seedance2.0` 支持 4-15 秒；`seedance2.0-fast` 固定 15 秒；`xinghe-2.0` 支持 4-15 秒 |
| `seconds` | string | 否 | 同 `duration`，例如 `"8"`、`"15"` |
| `client_task_id` | string | 否 | 客户端任务 ID，用于业务侧幂等或日志追踪 |

## 素材字段

图片、音频、视频都可以传公网 URL，也可以传 base64。公网 URL 不需要客户自己做中转；平台收到后会先下载到平台服务器，再进入内部上游流程。

### 图片参考

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `images_base64` | string[] | 图片 base64 数组，支持纯 base64 或 `data:image/...;base64,...` |
| `image_base64` | string | 单张图片 base64 |
| `image_url` | string | 单张图片公网 URL |
| `image_urls` | string[] | 多张图片公网 URL |
| `reference_image_urls` | string[] | 参考图片公网 URL 数组 |
| `images` | string[] | 多张图片，支持公网 URL 或 `data:image/...;base64,...` |
| `reference_images` | string[] | 参考图片，支持公网 URL 或 `data:image/...;base64,...` |

图片总数最多 9 张。首帧+参考图模式下，首帧也计入 9 张。

首帧+参考图模式没有单独的公开字段。把首帧放在图片数组第一张，其余图片按参考图放在后面，并在 `prompt` 中明确第一张是首帧。

### 音频参考

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `audios_base64` | string[] | 音频 base64 数组，支持纯 base64 或 `data:audio/...;base64,...` |
| `audio_base64` | string | 单个音频 base64 |
| `audio_base64s` | string[] | 多个音频 base64 |
| `audio_url` | string | 单个音频公网 URL |
| `audio_urls` | string[] | 多个音频公网 URL |
| `reference_audio` | string | 单个参考音频 |
| `reference_audios` | string[] | 多个参考音频 |
| `reference_audio_urls` | string[] | 多个参考音频公网 URL |

音频总数最多 3 个。

### 视频参考

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `video_url` | string | 单个视频参考公网 URL |
| `video_urls` | string[] | 多个视频参考公网 URL |
| `video` | string | 单个视频参考 |
| `videos` | string[] | 多个视频参考 |
| `reference_video` | string | 单个参考视频 |
| `reference_videos` | string[] | 多个参考视频 |
| `reference_video_urls` | string[] | 多个参考视频公网 URL |

视频参考总数最多 3 个。`seedance2.0`、`seedance2.0-fast`、`xinghe-2.0` 都按最多 3 个处理。

## 模型限制

| 模型 | 开放模式 | 图片 | 音频 | 视频参考 | 分辨率 | 时长 | 计费 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `seedance2.0` | 参考图、首帧+参考图 | 最多 9 张 | 最多 3 个 | 最多 3 个 | `720p` | 4-15 秒 | 按次 |
| `seedance2.0-fast` | 参考图、首帧+参考图 | 最多 9 张 | 最多 3 个 | 最多 3 个 | `720p` | 15 秒 | 按次 |
| `xinghe-2.0` | 参考图、首帧+参考图 | 最多 9 张 | 最多 3 个 | 最多 3 个 | `720p` | 4-15 秒 | 按次 |

单个图片、音频、视频素材最大 50MB。超过限制会直接返回错误，不提交上游。

## Seedance 示例

### 参考图 + 音频

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "seedance2.0",
  "prompt": "参考图片中的人物，在街头慢慢转身，电影感运镜，保持人物一致性",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 8,
  "image_urls": [
    "https://example.com/ref-1.png",
    "https://example.com/ref-2.jpg"
  ],
  "audio_urls": [
    "https://example.com/ref-audio.mp3"
  ]
}'
```

### 首帧 + 参考图

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "seedance2.0-fast",
  "prompt": "第一张图片作为视频首帧，后续图片作为人物和场景参考，生成自然镜头推进",
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "seconds": "15",
  "reference_image_urls": [
    "https://example.com/first-frame.png",
    "https://example.com/ref-person.png",
    "https://example.com/ref-scene.png"
  ]
}'
```

### base64 图片和音频

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "seedance2.0",
  "prompt": "参考图片人物，结合音频节奏生成自然口型和镜头运动",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 10,
  "images_base64": [
    "data:image/png;base64,iVBORw0KGgoAAA..."
  ],
  "audios_base64": [
    "data:audio/mpeg;base64,SUQzBAAAAAAA..."
  ]
}'
```

### 9 图 + 3 音频 + 3 视频参考

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "seedance2.0",
  "prompt": "融合参考图片、音频和视频动作，保持人物一致性，生成电影感短视频",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 15,
  "reference_image_urls": [
    "https://example.com/img-1.png",
    "https://example.com/img-2.png",
    "https://example.com/img-3.png",
    "https://example.com/img-4.png",
    "https://example.com/img-5.png",
    "https://example.com/img-6.png",
    "https://example.com/img-7.png",
    "https://example.com/img-8.png",
    "https://example.com/img-9.png"
  ],
  "reference_audios": [
    "https://example.com/audio-1.mp3",
    "https://example.com/audio-2.mp3",
    "https://example.com/audio-3.mp3"
  ],
  "reference_videos": [
    "https://example.com/video-1.mp4",
    "https://example.com/video-2.mp4",
    "https://example.com/video-3.mp4"
  ]
}'
```

## Xinghe 示例

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
  "model": "xinghe-2.0",
  "prompt": "参考图片人物和视频动作，生成自然运镜",
  "image_url": "https://example.com/person.png",
  "video_urls": [
    "https://example.com/video-ref-1.mp4",
    "https://example.com/video-ref-2.mp4"
  ],
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": 10
}'
```

## 提交响应

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "pending",
  "created": 1774842020,
  "model": "seedance2.0",
  "type": "video",
  "poll_url": "https://www.aicost.xyz/v1/videos/task_xxx",
  "data": [],
  "results": []
}
```

`id` 就是后续查询用的任务 ID。

## 查询任务

```http
GET /v1/videos/{task_id}
```

完整地址：

```text
https://www.aicost.xyz/v1/videos/task_xxx
```

请求头：

```http
Authorization: Bearer sk-xxxxxxxx
```

处理中：

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "running",
  "model": "seedance2.0",
  "progress": 45,
  "data": [],
  "results": []
}
```

已完成：

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "completed",
  "model": "seedance2.0",
  "progress": 100,
  "result_url": "https://www.aicost.xyz/v1/videos/task_xxx/content",
  "data": [
    {
      "url": "https://www.aicost.xyz/v1/videos/task_xxx/content"
    }
  ],
  "results": [
    {
      "url": "https://www.aicost.xyz/v1/videos/task_xxx/content"
    }
  ]
}
```

`result_url` 是平台视频下载地址，不是上游临时地址。

## 下载结果

```http
GET /v1/videos/{task_id}/content
```

完整地址：

```text
https://www.aicost.xyz/v1/videos/task_xxx/content
```

成功时接口直接返回 mp4 文件流。

```bash
curl -L \
  -H "Authorization: Bearer sk-xxxxxxxx" \
  -o result.mp4 \
  "https://www.aicost.xyz/v1/videos/task_xxx/content"
```

## 任务状态

| 状态 | 说明 |
| --- | --- |
| `pending` | 已提交，等待处理 |
| `queued` | 排队中 |
| `submitted` | 已提交到内部上游 |
| `running` | 生成中 |
| `completed` | 已完成 |
| `failed` | 失败 |
| `timeout` | 超时 |

## 超时规则

Seedance 任务最长等待 1 天。超过 1 天未完成时，任务状态标记为失败；Seedance 超时失败不自动退款。

## 常见错误

| 错误 | 处理方式 |
| --- | --- |
| 图片超过 9 张 | 减少所有图片字段的总数量 |
| 音频超过 3 个 | 减少所有音频字段的总数量 |
| 视频参考超过 3 个 | 减少所有视频字段的总数量 |
| 素材超过 50MB | 压缩或更换素材 |
| `seedance2.0` 时长不在 4-15 秒 | 传 `duration` 或 `seconds` 为 4 到 15 |
| `seedance2.0-fast` 时长不是 15 秒 | 固定传 `duration: 15` 或 `seconds: "15"` |
| `seedance2.0` / `seedance2.0-fast` 请求文生视频、单首帧、首尾帧 | 改为参考图或首帧+参考图 |
| `xinghe-2.0` 分辨率不是 `720p` | 固定传 `resolution: "720p"` |
| 上游视频服务提交超时 | 稍后重试 |
| Authorization 无效 | 检查 API Key |
