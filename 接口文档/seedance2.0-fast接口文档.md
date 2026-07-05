# seedance2.0-fast 视频生成接口文档

## 基础信息

基础地址：

```text
https://www.aicost.xyz
```

模型名：

```text
seedance2.0-fast
```

鉴权方式：

```http
Authorization: Bearer sk-xxxxxxxx
Content-Type: application/json
```

接口使用异步任务模式。提交任务后返回任务 ID，客户端通过轮询查询任务状态；任务完成后，返回平台 mp4 地址。

## 提交视频生成任务

```http
POST /v1/videos
```

完整地址：

```text
https://www.aicost.xyz/v1/videos
```

### 请求参数

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| model | string | 是 | 固定传 `seedance2.0-fast` |
| prompt | string | 是 | 视频生成提示词 |
| images_base64 | string[] | 否 | 参考图片数组。支持纯 base64 或 `data:image/...;base64,...`。最多 9 张，首帧图也计入 9 张内 |
| audios_base64 | string[] | 否 | 参考音频数组。支持纯 base64 或 `data:audio/...;base64,...`。最多 3 个 |
| aspect_ratio | string | 否 | 视频比例：`auto`、`16:9`、`9:16`、`1:1`。默认 `16:9` |
| resolution | string | 否 | 分辨率，固定支持 `720p` |
| duration | string \| number | 否 | 视频时长。传 `auto` 或 `15`，实际生成 15 秒 |
| seconds | string \| number | 否 | 视频秒数。传 `15`，实际生成 15 秒 |
| client_task_id | string | 否 | 客户端任务 ID，用于业务侧幂等或日志追踪 |

不使用以下字段：

| 字段 | 原因 |
| --- | --- |
| image_base64 | 使用 `images_base64` 统一承载单张或多张图片 |
| audio_base64 | 使用 `audios_base64` 统一承载单个或多个音频 |
| image_url | 该模型接口不要求客户提供公网图片地址 |
| image_urls | 该模型接口不要求客户提供公网图片地址 |
| audio_url | 该模型接口不要求客户提供公网音频地址 |
| audio_urls | 该模型接口不要求客户提供公网音频地址 |
| multipart/form-data | 该模型接口只接收 JSON 请求体 |

### 素材限制

| 限制项 | 规则 |
| --- | --- |
| 图片数量 | 最多 9 张 |
| 音频数量 | 最多 3 个 |
| 单个素材大小 | 最大 50MB |
| 音频总时长 | 大于 2 秒且小于 15 秒 |
| 图片格式 | 按上传格式处理，不强制转 JPG |
| 请求格式 | 只支持 JSON，不使用 multipart |

## 生成模式说明

接口不需要额外传 `mode` 字段，模式由素材和提示词语义决定。

### 文生视频

不传图片和音频，只传 `prompt`。

```json
{
  "model": "seedance2.0-fast",
  "prompt": "一个女孩在海边奔跑，电影感，真实光影",
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": "auto",
  "seconds": 15
}
```

curl 示例：

```bash
curl -X POST "https://www.aicost.xyz/v1/videos" \
  -H "Authorization: Bearer sk-xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "seedance2.0-fast",
    "prompt": "一个女孩在海边奔跑，电影感，真实光影",
    "aspect_ratio": "16:9",
    "resolution": "720p",
    "duration": "auto",
    "seconds": 15
  }'
```

### 参考图生视频

传 `images_base64`。普通参考图模式不会固定第一张图为首帧。

```json
{
  "model": "seedance2.0-fast",
  "prompt": "参考图片中的人物风格生成一段电影感镜头",
  "images_base64": [
    "data:image/png;base64,iVBORw0KGgoAAA..."
  ],
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "duration": "auto",
  "seconds": 15
}
```

### 首帧生成视频

传 1 张图片到 `images_base64[0]`，并在提示词中明确第一张图为固定首帧。

```json
{
  "model": "seedance2.0-fast",
  "prompt": "让人物转身微笑，电影感镜头运动\n\n@图1 当前图片为视频固定首帧",
  "images_base64": [
    "data:image/png;base64,iVBORw0KGgoAAA..."
  ],
  "aspect_ratio": "9:16",
  "resolution": "720p",
  "duration": "auto",
  "seconds": 15
}
```

### 首帧 + 参考图生视频

`images_base64[0]` 为固定首帧，其余图片为参考图。图片总数最多 9 张。

```json
{
  "model": "seedance2.0-fast",
  "prompt": "以第一张图作为视频开头，参考其他图片的人物和服装，生成电影感运动镜头\n\n@图1 当前图片为视频固定首帧 @图2 @图3",
  "images_base64": [
    "data:image/png;base64,iVBORw0KGgoAAA...",
    "data:image/png;base64,iVBORw0KGgoBBB...",
    "data:image/png;base64,iVBORw0KGgoCCC..."
  ],
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": "auto",
  "seconds": 15
}
```

### 图片 + 音频参考

图片放 `images_base64`，音频放 `audios_base64`。

```json
{
  "model": "seedance2.0-fast",
  "prompt": "参考图片中的人物，结合音频节奏生成自然口型和镜头运动",
  "images_base64": [
    "data:image/png;base64,iVBORw0KGgoAAA..."
  ],
  "audios_base64": [
    "data:audio/mpeg;base64,SUQzBAAAAAAA..."
  ],
  "aspect_ratio": "16:9",
  "resolution": "720p",
  "duration": "auto",
  "seconds": 15
}
```

## 成功响应

提交成功后返回异步任务对象。

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "pending",
  "created": 1774842020,
  "model": "seedance2.0-fast",
  "type": "video",
  "poll_url": "https://www.aicost.xyz/v1/videos/task_xxx",
  "data": [],
  "results": []
}
```

字段说明：

| 字段 | 说明 |
| --- | --- |
| id | 平台任务 ID |
| object | 固定为 `task` |
| status | 当前任务状态 |
| created | 任务创建时间戳 |
| model | 请求使用的模型 |
| poll_url | 任务查询地址 |
| data | 任务数据数组 |
| results | 任务结果数组 |

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

### 处理中响应

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "running",
  "model": "seedance2.0-fast",
  "progress": 45,
  "data": [],
  "results": []
}
```

### 完成响应

任务完成后，返回结果里包含平台 mp4 地址。

```json
{
  "id": "task_xxx",
  "object": "task",
  "status": "completed",
  "model": "seedance2.0-fast",
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

## 下载结果

```http
GET /v1/videos/{task_id}/content
```

完整地址：

```text
https://www.aicost.xyz/v1/videos/task_xxx/content
```

请求头：

```http
Authorization: Bearer sk-xxxxxxxx
```

成功时接口直接返回 mp4 文件流。

下载示例：

```bash
curl -L \
  -H "Authorization: Bearer sk-xxxxxxxx" \
  -o result.mp4 \
  "https://www.aicost.xyz/v1/videos/task_xxx/content"
```

## 任务状态

| 状态 | 说明 |
| --- | --- |
| pending | 已提交，等待处理 |
| queued | 排队中 |
| running | 生成中 |
| completed | 已完成 |
| failed | 失败 |
| timeout | 超时 |

## 错误响应

```json
{
  "error": {
    "message": "Seedance 2.0 Fast 最多支持9张图片，当前传入10张，请减少参考图数量",
    "type": "invalid_request_error"
  }
}
```

常见错误：

| 错误 | 处理方式 |
| --- | --- |
| 图片超过 9 张 | 减少 `images_base64` 数量 |
| 音频超过 3 个 | 减少 `audios_base64` 数量 |
| 素材超过 50MB | 压缩素材后重新提交 |
| 音频总时长不在 2-15 秒内 | 调整音频长度后重新提交 |
| resolution 不支持 | 固定传 `720p` |
| Authorization 无效 | 检查 API Key |
