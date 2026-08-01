---
status: complete
slug: economy-video-credit-800
completed: 2026-07-25
---

# 经济版数字人视频按分钟计费完成

## 结果

- 主视频生成按完整克隆音频实际时长计费，每开始 1 分钟收取 800 积分。
- 36 秒和 60 秒均收取 800 积分，60.001 秒收取 1600 积分。
- 音色克隆继续收取 10 积分。
- 单个失败分段重试继续收取 200 积分。
- `dh_economy_video_segment` 与 `dh_economy_video_retry` 已在服务端消费场景和可变金额校验中注册。
- 视频阶段扣费继续使用任务级幂等键，余额不足时不会提交视频分段。
- 本条结论已被 2026-07-25 后续产品决定替代：经济版改为每 20 秒一段、每段 250 积分，按实际分段数累计。

## 验证

- Python：经济版定价、API 鉴权、路由和服务测试 48 项通过。
- Node：定价注册表测试 8 项通过。
- TypeScript：`npx tsc --noEmit` 通过。
- Python：相关文件 `compileall` 通过。
- `git diff --check` 通过，仅存在仓库既有的 LF/CRLF 转换提示。
