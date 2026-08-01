---
status: fixed_locally
slug: economy-runtime-credit-cover
started: 2026-07-25
---

# 经济版积分场景与封面失败调试

## 症状

- 桌面端经济版任务在音色克隆完成后报“不支持的消费场景: dh_economy_video_segment”。
- 同一页面封面显示“文件上传网络错误: All connection attempts failed”。

## 已确认的证据

- 实际运行程序是 `release/win-unpacked`，Next 监听 3010、FastAPI 监听 8010。
- 桌面端启用了 `CLOUD_API_URL`，视频阶段扣费被转发到云端 `/api/credit/consume`。
- 本地日志中云端音色克隆扣费返回 200，视频场景扣费返回 400。
- 故障发生时，本地打包资源仍是旧的每段 200 积分定价；当前产品规则已统一为每 20 秒一段、每段 250 积分。
- 同一个封面任务的 RunningHub 上传、提交、轮询和最终 PNG 下载均成功。
- `RunningHubClient.upload_file` 对瞬时网络错误没有重试。
- 封面运行时从失败切回 running/success 时没有显式清空旧 `coverError`。

## 根因

1. 混合模式把经济版动态价格转发到了 `/api/credit/consume`。该接口按固定场景表校验且忽略客户端 `cost`，不仅导致旧云端拒绝新场景，也无法按后台实际切出的 20 秒分段数正确累计扣费。
2. 封面上传的瞬时连接错误被直接固化为失败；后续成功状态没有可靠清除旧 `coverError`。

## 修复

- 新增云端动态计费转发，传递 `billing_key + segment_count` 到 `/api/credit/consume-billing`，由云端注册表按每段 250 积分权威计算费用。
- RunningHub 文件上传遇到网络异常时最多重试 3 次，按 1 秒、2 秒退避；HTTP 业务错误不重试。
- 封面重试开始和成功时清空旧错误。

## 验证

- Python：经济版、计费、封面相关测试共 49 个通过。
- Node：定价注册表和封面状态测试共 10 个通过。
- TypeScript：`tsc --noEmit` 通过。
- Windows 安装包已重新构建：`release/招财猫-Setup-1.3.8.exe`。
- 解包程序烟测：Next 3010 与 FastAPI 8010 均返回 200，ffmpeg / ffprobe / 数据目录检查通过。
- 尚需：通过受保护服务的正式发布流程部署云端 API；本轮未绕过仓库的保护性部署限制。
