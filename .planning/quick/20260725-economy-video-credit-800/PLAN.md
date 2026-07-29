---
status: in_progress
slug: economy-video-credit-800
date: 2026-07-25
---

# 经济版数字人视频按分钟计费

## 目标

- 完整视频按克隆音频实际时长计费，每开始 1 分钟收取 800 积分。
- 音色克隆继续收取 10 积分。
- 单个 20 秒失败分段重试继续收取 200 积分。
- 确保 `dh_economy_video_segment` 与 `dh_economy_video_retry` 是受支持的服务端消费场景。
- 保持幂等扣费，余额不足时不提交任何视频分段。

## 验证

- Python 与 TypeScript 定价注册表交叉测试。
- FastAPI 消费场景和幂等扣费测试。
- 经济版后台流水线分阶段扣费测试。
- TypeScript 类型检查与经济版相关回归测试。
