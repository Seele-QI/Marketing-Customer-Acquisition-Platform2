# 数字人分镜速率与任务韧性审计

> 审计日期：2026-07-27  
> 范围：分镜 AI 请求链、Electron 云配置热更新、跨界面任务跟踪

## 症状与根因

| ID | 严重度 | 发现 | 分类 | 处理结果 |
|---|---|---|---|---|
| F01 | high | 分镜模型按 GPT → Claude → DeepSeek → 豆包串行回退，单渠道默认可等待 280 秒，失效渠道会把总耗时放大到数分钟 | auto | fixed：单渠道默认 60 秒、整链 150 秒 |
| F02 | high | 每次分镜请求都先调用 Electron 云配置同步；命中新版本会重启 Next/FastAPI，既增加一次云请求，也可能打断紧随其后的本地请求 | auto | fixed：先探测本地就绪，仅未就绪时同步 |
| F03 | high | 离开视频主模块会卸载 `VideoWorkspace`；分镜请求虽仍可能在服务端执行，但组件状态和返回结果无人接收 | auto | fixed：首次进入后工作区常驻，仅切换显示状态 |
| F04 | high | dh-v2 状态轮询把临时网络错误直接转换为终态失败，未使用 TaskRuntime 已有的错误重试计数 | auto | fixed：网络/超时错误上抛，由运行时重试 |
| F05 | high | 云配置热更新不区分 FastAPI 内是否有正在生成的视频，直接重启会终止内存协程 | auto | fixed：增加本地活动任务探测，任务终态后再重启 |
| F06 | medium | 分镜固定请求 8192 tokens，单段短文案也使用最大输出预算 | auto | fixed：按段数动态使用 2048–6144 tokens |
| F07 | medium | 缺少分镜模型实际耗时记录，无法从日志区分慢模型、超时和 JSON 解析回退 | auto | fixed：记录 provider、duration、timeout、ok |

## 运行证据

- `main.log` 在 `2026-07-26T01:23:41` 记录配置更新并重启，约 0.4 秒后 `/api/dh-video-v2/submit` 返回本地服务 503。
- `main.log` 在 `2026-07-26T01:31:41` 记录配置更新并重启，约 1.8 秒后 `/api/dh-video-v2/plan-script` 出现本地服务错误。
- 原实现中 Sonetto、DeepSeek、豆包分镜调用均使用 280000ms 等待；渠道之间顺序执行。
- 前端 `ContentArea` 仅在 `isVideoView(activeView)` 时渲染 `VideoWorkspace`，切换到工作台/GEO 等主界面会卸载组件。

## 验证

- Node 定向回归：分镜就绪、渠道预算、模型顺序、任务恢复、运行时轮询，共 16 项通过。
- Python 路由测试：活动任务统计仅计算非终态任务，通过。
- `pnpm exec tsc --noEmit`：通过。
- `pnpm electron:build`：通过。
- `pnpm build`：Next.js 生产构建通过，119 个静态页面生成完成。
- ESLint 未执行：当前依赖中未安装 `eslint` 可执行文件。

## UAT 验收

- [ ] 已有本地模型配置时点击生成分镜，主进程日志不应出现由本次点击触发的配置同步/服务重启。
- [ ] 分镜生成中切到工作台或 GEO，再返回数字人页面，仍显示原生成状态并接收结果。
- [ ] 视频生成中短暂重启本地服务或制造一次网络中断，任务不立即变成失败。
- [ ] 视频生成期间云配置版本变化，日志先记录任务守卫等待；视频终态后再重启子进程。
- [ ] `next.log` 可看到 `[dh-v2-plan] provider=... duration_ms=...`，失败渠道在预算内切换备选。

