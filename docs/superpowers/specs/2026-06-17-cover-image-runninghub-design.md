# 视频封面图 RunningHub 生成设计

## 背景
- 当前视频创作链路在视频生成成功后，会尝试自动生成封面图。
- 项目里已经存在 RunningHub 封面图接口封装，目标端点为 `rhart-image-g-2/image-to-image`。
- 当前页面会显示“封面图自动生成中...”，但封面图状态管理不完整，失败时缺少明确反馈与重试机制。
- 用户已确认：
- 封面图输入固定使用“用户上传的数字人原图”。
- 默认自动生成封面图。
- 封面图失败不影响视频结果，允许用户手动重试。

## 目标
- 视频主任务成功后，自动调用 RunningHub 图生图接口生成封面图。
- 封面图输入图固定使用用户上传原图，不走视频抽帧。
- 封面图失败时不拖垮视频任务，视频仍然正常可用。
- 前端封面区域支持明确区分“生成中 / 成功 / 失败可重试”状态。
- 用户可以手动点击“重新生成封面”，重试同一任务的封面图生成。

## 非目标
- 不改成视频抽帧生成封面。
- 不新增本地 FFmpeg 截帧逻辑。
- 不引入占位封面图作为默认成功结果。
- 不改变视频主任务的 RunningHub 视频生成工作流。

## 方案选择

### 方案 A：自动生成 + 失败可手动重试
- 视频成功后自动触发封面图生成。
- 封面图失败仅影响封面区域，不影响视频主结果。
- UI 在失败后提供“重新生成封面”按钮。
- 结论：采用本方案。

### 方案 B：完全改为手动生成
- 仅在用户点击按钮时才生成封面图。
- 不符合当前已有“封面图自动生成中...”的页面预期。

### 方案 C：自动生成失败后显示占位封面
- 视觉上有兜底，但容易让用户误以为占位图是真实生成结果。
- 不符合本次“真实走 RunningHub 封面图链路”的目标。

## 接口与数据流

### 输入来源
- 使用视频提交时已上传到 RunningHub 的用户原图 `image_url` 作为 `imageUrls` 的唯一输入。
- 不额外上传视频帧，不在后处理阶段抽图。

### RunningHub 请求
- 端点：`POST /openapi/v2/rhart-image-g-2/image-to-image`
- 请求体字段固定为：
- `prompt`
- `imageUrls`
- `aspectRatio`
- `resolution`
- 轮询端点继续使用：`POST /openapi/v2/query`

### 自动链路
- 视频主任务成功拿到 `video_url` 后：
- 后端异步提交封面图任务。
- 将封面状态标记为 `running`。
- RunningHub 返回成功结果后回写 `cover_url`。
- 若封面失败，则回写 `cover_status=failed` 和 `cover_error`。

### 手动重试链路
- 前端点击“重新生成封面”按钮。
- 调用 `POST /api/video/cover`。
- 后端从 `_task_store[task_id]` 中读取原始 `image_url` 与 `gender`。
- 再次调用 RunningHub 封面图接口。
- 成功后更新同一任务的 `cover_url` 与 `cover_status=success`。

## 后端设计

### `lib/runninghub_client.py`
- 保留现有 `submit_cover_image()` 封装，但要统一确认与文档字段完全一致：
- `prompt`
- `imageUrls`
- `aspectRatio`
- `resolution`
- 增强错误信息，确保在失败时能看到：
- HTTP 状态码
- 响应体片段
- RunningHub 返回的 `errorMessage`
- 返回 `taskId` 缺失时给出明确异常

### `main.py`
- 视频自动链路在视频成功后继续自动触发封面图生成。
- `_task_store` 增加封面相关字段：
- `cover_status`
- `cover_error`
- `cover_task_id`
- 创建视频任务时初始化这些字段为空或默认值。
- 自动封面图开始时写入：
- `cover_status="running"`
- `cover_error=""`
- `cover_task_id=<RunningHub taskId>`
- 自动封面图成功时写入：
- `cover_status="success"`
- `cover_url=<结果地址>`
- `cover_error=""`
- 自动封面图失败时写入：
- `cover_status="failed"`
- `cover_error=<失败原因>`
- `video_status` 接口返回上述字段，供前端轮询更新。
- `POST /api/video/cover` 复用同一套封面图提交逻辑，作为手动重试入口。

## 前端设计

### `components/video-creation-workflow.tsx`
- 当前封面区域需要从“只有成功 / 一直生成中”扩展为 4 态：
- `idle`
- `running`
- `success`
- `failed`
- 显示规则：
- `success`：展示 `coverUrl` 和下载入口。
- `running`：显示“封面图自动生成中...”。
- `failed`：显示“封面生成失败，可重试”和按钮。
- `idle`：显示默认占位空态，不误导为正在生成。
- 当视频任务已经成功，但封面状态失败时，页面仍显示视频成功结果，不应整体跳回失败态。
- 点击“重新生成封面”时：
- 调用 `/api/video/cover`
- 按钮进入 loading 态
- 成功后更新 `coverUrl`
- 失败后显示最新错误信息

## 状态模型
- 视频任务主状态与封面图状态解耦。
- 视频状态负责：
- `queued / polling / success / post_processing / published / failed`
- 封面状态独立负责：
- `idle / running / success / failed`
- 封面失败不会改写视频主状态为失败。

## 错误处理
- RunningHub 封面提交失败：
- 记录 `cover_status=failed`
- 保存 `cover_error`
- 不影响视频主任务成功态
- RunningHub 查询失败：
- 同样只更新封面状态，不回滚视频结果
- 缺少 `image_url` 或 `task_id`：
- `POST /api/video/cover` 返回明确 400/404 错误
- 前端提示“无法重试封面生成，请重新创建视频任务”

## 验证方案

### 自动化测试
- 增加 RunningHub 客户端测试，覆盖：
- 封面图请求 payload 字段正确
- 缺少 `taskId` 时抛出明确错误
- 增加后端任务状态测试，覆盖：
- 自动触发封面图时写入 `cover_status=running`
- 成功后写入 `cover_status=success` 和 `cover_url`
- 失败后写入 `cover_status=failed`，但视频主状态仍保持成功
- 增加前端状态测试，覆盖：
- 封面失败时显示“重新生成封面”而非无限 loading

### 手工回归
- 视频生成成功后，封面区域进入“自动生成中”。
- 封面成功后显示真实封面图。
- 人为制造封面失败时，视频仍然可播放，封面区域出现“重新生成封面”按钮。
- 点击重试后，封面能重新进入生成态并最终成功或失败。

## 验收标准
- 视频成功后会自动调用 RunningHub 图生图接口生成封面。
- 封面图输入固定来自用户原图。
- 封面生成失败不影响视频任务结果。
- 页面不再无限显示“封面图自动生成中...”。
- 用户可以手动重试封面生成。
- 重试成功后页面能更新为新的 `cover_url`。
