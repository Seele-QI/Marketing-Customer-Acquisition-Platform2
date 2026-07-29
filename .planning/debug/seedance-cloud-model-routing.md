---
status: resolved
trigger: "Seedance 模型调用失败，第三方 API 后台无调用记录；怀疑云端把大语言模型错误映射为视频模型"
created: 2026-07-21
updated: 2026-07-21
mode: diagnose_only
---

# Seedance 云端模型路由诊断

## 结论

根因不是“LLM 被映射为视频模型”，而是以下配置组合故障：

1. 云端版本 `cfg_db_5_1784547614` 只有 3 条 LLM provider，没有视频 provider，也没有下发 `SEEDANCE_*` 配置。
2. 根目录 `.env:61` 把 `SEEDANCE_PRIMARY_BASE_URL=https://api.7tai.cc` 粘在 `#` 注释末尾，dotenv 将整行忽略；打包后的 `resources/.env` 因此也缺少 primary Base URL。
3. Primary 同时要求 Base URL 与 Key，缺少 Base URL 后被跳过，程序只构造了 aicost secondary。
4. 运行时实际向 `https://www.aicost.xyz/v1/videos` 提交 `seedance2.0-fast`，上游在任务创建前返回 403：`无权访问 xinghe2.0 分组`。
5. 请求在网关权限层被拒绝，没有创建模型任务，所以第三方模型后台没有调用记录。

置信度：高。

## 关键证据

- 管理后台截图：“视频模型”页显示“暂无配置”；“大语言模型”页有 3 条启用配置。
- 只读解密本机缓存凭证后确认：3 条 provider 全部为 `kind=llm`，adapter 分别为 `openai_chat`、`openai_chat`、`ark_chat`；无 `seedance_video` / `xinghe_video`，Key 名中也无 `SEEDANCE_*`。
- 本地 Seedance Key 与云端 3 个 LLM Key 均不相同，排除 Key 误映射。
- `lib/synced_providers.py:53-58` 只把 `seedance_video` / `xinghe_video` 识别为视频渠道。
- `lib/dh_video_v2_service.py:75-96` 要求 endpoint 同时具备 Base URL 与 Key，否则不加入候选。
- `.env:61` 的 primary Base URL 位于注释行末尾；`release/win-unpacked/resources/.env` 中该变量不存在。
- 现场日志确认选路为 `secondary model=seedance2.0-fast media=base64`，随后 `POST https://www.aicost.xyz/v1/videos` 返回 `403 Forbidden`。
- 任务状态保存的精确上游错误为：`无权访问 xinghe2.0 分组`。
- 最小断言验证通过：LLM provider 被视频 adapter 过滤，只有 `seedance_video` provider 会进入 Seedance endpoint 列表。

## 已排除

- LLM model 或 LLM Key 被本地映射为 Seedance。
- 请求没有离开本机。
- 预期的 7tai primary 返回 403。该任务根本没有路由到 7tai。

## 处理状态

- 本次为 diagnose-only，未修改产品代码、`.env` 或运行配置。
- 未调用真实视频模型做复测，未产生额外第三方费用。
- 系统 Python 当前不可启动，打包 Python 未安装 pytest；已使用打包 Python 完成无网络最小断言验证。
