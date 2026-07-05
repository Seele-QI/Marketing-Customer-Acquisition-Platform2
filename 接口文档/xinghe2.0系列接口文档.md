# Xinghe 2.0 系列视频接口终端对接文档

更新时间：2026-06-29

本文档只说明通过 `https://www.aicost.xyz` 对接 Xinghe 系列视频模型。

支持模型：

- `xinghe-mini`
- `xinghe-fast`
- `xinghe-2.0`

## 1. 接入信息

### Base URL

```text
https://www.aicost.xyz
```

### 鉴权

所有请求都需要传 API Key：

```text
Authorization: Bearer YOUR_API_KEY
```

如果 Key 无效、未传 Key、Key 所在分组没有模型权限，一般会返回 `401`、`403` 或 `No available channel`。

## 2. 模型名称

按需传下面 3 个模型之一：

```text
xinghe-mini
xinghe-fast
xinghe-2.0
```

不要拼接模型后缀。横竖屏、时长、清晰度都通过请求字段控制。

## 3. 接口总览

| 用途 | 方法 | 路径 | 说明 |
| --- | --- | --- | --- |
| 创建视频任务 | POST | `/v1/video/create` | 提交文生视频、图生视频、音频参考生视频 |
| 查询视频任务 | GET | `/v1/video/query?id={task_id}` | 根据任务 ID 查询进度和结果 |

请求体使用 `application/json`。

## 4. 模型能力

| 模型 | 时长 | 比例 | 清晰度 | 参考图 | 音频参考 |
| --- | --- | --- | --- | --- | --- |
| `xinghe-mini` | 4-15 秒 | 16:9 / 9:16 | 720p | 最多 9 张 | 最多 3 个 |
| `xinghe-fast` | 4-15 秒 | 16:9 / 9:16 | 720p | 最多 9 张 | 最多 3 个 |
| `xinghe-2.0` | 4-15 秒 | 16:9 / 9:16 | 720p / 1080p | 最多 9 张 | 最多 3 个 |

重要说明：

- 只有 `xinghe-2.0` 支持 `1080p`。
- `xinghe-mini` 和 `xinghe-fast` 只能传 `720p`。
- 所有 Xinghe 模型只支持 `16:9` 和 `9:16`。
- 参考图最多 9 张。
- 音频参考最多 3 个。

## 5. 创建视频任务

### 接口

```text
POST https://www.aicost.xyz/v1/video/create
Content-Type: application/json
Authorization: Bearer YOUR_API_KEY
```

### 请求字段

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `model` | string | 是 | `xinghe-mini`、`xinghe-fast`、`xinghe-2.0` |
| `prompt` | string | 是 | 视频提示词 |
| `duration` | number | 是 | 视频时长，支持 `4-15` 秒 |
| `ratio` | string | 是 | `16:9` 或 `9:16` |
| `resolution` | string | 是 | `720p` 或 `1080p`；`1080p` 仅 `xinghe-2.0` 可用 |
| `images_base64` | string[] | 否 | 参考图数组，最多 9 张 |
| `audio_urls` | string[] | 否 | 音频参考数组，最多 3 个 |
| `client_task_id` | string | 否 | 客户端自定义任务 ID，方便排查日志 |

### 参考图格式

参考图建议传 data URL/base64：

```text
data:image/jpeg;base64,/9j/4AAQ...
data:image/png;base64,iVBORw0KGgo...
```

### 音频格式

音频参考建议传 data URL/base64：

```text
data:audio/mpeg;base64,//uQZAAA...
data:audio/wav;base64,UklGRiQAA...
```

## 6. 文生视频示例

```bash
curl -X POST "https://www.aicost.xyz/v1/video/create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "xinghe-fast",
    "prompt": "雪山日出的航拍镜头，电影感，缓慢推进",
    "duration": 6,
    "ratio": "16:9",
    "resolution": "720p"
  }'
```

## 7. 图生视频示例

多张参考图按数组顺序传入，最多 9 张。

```bash
curl -X POST "https://www.aicost.xyz/v1/video/create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "xinghe-2.0",
    "prompt": "保留参考图主体身份、服装和场景不变，让人物自然转身，固定机位，电影感光影",
    "duration": 10,
    "ratio": "9:16",
    "resolution": "720p",
    "images_base64": [
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD...",
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
    ]
  }'
```

## 8. Xinghe 2.0 1080p 示例

`1080p` 只允许用于 `xinghe-2.0`。

```bash
curl -X POST "https://www.aicost.xyz/v1/video/create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "xinghe-2.0",
    "prompt": "高细节产品展示镜头，镜头缓慢推进，真实反光，商业广告质感",
    "duration": 8,
    "ratio": "16:9",
    "resolution": "1080p",
    "images_base64": [
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
    ]
  }'
```

## 9. 图片 + 音频参考示例

```bash
curl -X POST "https://www.aicost.xyz/v1/video/create" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "xinghe-2.0",
    "prompt": "舞台上的歌手自然演唱，表情和动作跟随音乐情绪，人物身份保持一致，电影级舞台灯光",
    "duration": 12,
    "ratio": "16:9",
    "resolution": "720p",
    "images_base64": [
      "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD..."
    ],
    "audio_urls": [
      "data:audio/mpeg;base64,//uQZAAAAAAAAAAAAAAAAAAAA..."
    ]
  }'
```

## 10. 创建任务返回

成功时一般会返回任务 ID：

```json
{
  "id": "task_xxxxxxxxxxxxxxxxxxxx",
  "task_id": "task_xxxxxxxxxxxxxxxxxxxx",
  "status": "queued",
  "progress": 0,
  "model": "xinghe-2.0"
}
```

终端侧需要保存任务 ID，用于后续查询。

任务 ID 读取顺序建议：

```text
task_id -> id -> data.task_id -> data.id
```

## 11. 查询任务

### 接口

```text
GET https://www.aicost.xyz/v1/video/query?id={task_id}
Authorization: Bearer YOUR_API_KEY
```

### curl 示例

```bash
curl -X GET "https://www.aicost.xyz/v1/video/query?id=task_xxxxxxxxxxxxxxxxxxxx" \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### 生成中返回示例

```json
{
  "id": "task_xxxxxxxxxxxxxxxxxxxx",
  "task_id": "task_xxxxxxxxxxxxxxxxxxxx",
  "status": "processing",
  "progress": 45,
  "model": "xinghe-2.0"
}
```

### 成功返回示例

```json
{
  "id": "task_xxxxxxxxxxxxxxxxxxxx",
  "task_id": "task_xxxxxxxxxxxxxxxxxxxx",
  "status": "SUCCESS",
  "progress": "100%",
  "result_url": "https://www.aicost.xyz/static-custom/generated-videos/demo.mp4",
  "video_url": "https://www.aicost.xyz/static-custom/generated-videos/demo.mp4",
  "data": {
    "id": "task_xxxxxxxxxxxxxxxxxxxx",
    "task_id": "task_xxxxxxxxxxxxxxxxxxxx",
    "model": "xinghe-2.0",
    "url": "https://www.aicost.xyz/static-custom/generated-videos/demo.mp4",
    "video_url": "https://www.aicost.xyz/static-custom/generated-videos/demo.mp4",
    "result_url": "https://www.aicost.xyz/static-custom/generated-videos/demo.mp4"
  }
}
```

终端侧只需要提取最终视频 URL。

视频 URL 读取顺序建议：

```text
stable_video_url -> video_url -> result_url -> url -> data.video_url -> data.result_url -> data.url
```

## 12. 轮询建议

创建任务后保存 `task_id`。

建议每 5-10 秒查询一次。

外层 `status=SUCCESS` 或 `progress=100%` 时停止轮询，并读取视频链接。

外层 `status=failed`、`failure`、`error`、`cancelled`、`rejected` 时停止轮询，并读取失败原因。

客户端总等待时间建议不少于 3600 秒。

## 13. 常见错误

| 错误 | 常见原因 | 处理方式 |
| --- | --- | --- |
| `401 Unauthorized` | API Key 错误、未传 Key、Key 被禁用 | 检查 `Authorization: Bearer YOUR_API_KEY` |
| `No available channel` | Key 所在分组没有模型权限，或渠道不可用 | 检查令牌分组和渠道模型 |
| `model_not_found` | 模型名写错 | 只能传 `xinghe-mini`、`xinghe-fast`、`xinghe-2.0` |
| `unsupported resolution` | 非 `xinghe-2.0` 传了 `1080p` | 改成 `720p`，或切换到 `xinghe-2.0` |
| `invalid duration` | 时长不支持 | 只传 `4-15` 秒 |
| `invalid ratio` | 比例不支持 | 只传 `16:9` 或 `9:16` |
| `too many images` | 参考图超过 9 张 | 减少到 9 张以内 |
| `too many audios` | 音频参考超过 3 个 | 减少到 3 个以内 |
| `PARAMS_INVALID` | 图片或音频格式不符合上游要求 | 使用 data URL/base64，确认素材可读 |
| `task_queue_full` / `503` | 上游队列满 | 稍后重试，客户端做退避 |
| `429` | 上游限流或额度暂不可用 | 稍后重试 |

## 14. 对接注意事项

- 只支持 Xinghe 系列 3 个模型。
- 模型名不要拼后缀，参数通过 `duration`、`ratio`、`resolution` 控制。
- `xinghe-2.0` 支持 `720p` 和 `1080p`。
- `xinghe-mini`、`xinghe-fast` 只支持 `720p`。
- 参考图最多 9 张，建议全部传 data URL/base64。
- 音频参考最多 3 个，建议全部传 data URL/base64。
- 查询任务时以 `task_id` 为准。
- 拿到视频链接后建议尽快下载保存。
- 客户端超时时间建议设置为 3600 秒以上。
