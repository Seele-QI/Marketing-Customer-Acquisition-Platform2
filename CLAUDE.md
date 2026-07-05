# CLAUDE.md

> 给 Claude（以及后续接手开发者）的项目导航与运维速查表。
> 内容会随着项目演进持续更新；任何对外部服务/部署契约的改动都应同步到这里。

---

## 项目结构速览

```
13-中台网站/
├── app/                    # Next.js App Router
│   ├── api/                # 内部 API Route（Remotion 渲染等）
│   ├── admin/credit/       # 积分管理后台
│   └── ...                 # 各业务页面
├── components/             # React 客户端组件
│   ├── video-creation-workflow.tsx   # 数字人口播主流程（sidebar label: "数字人口播"，内部 view key: "视频创作"）
│   └── ...
├── lib/                    # 工具与共享代码
│   ├── video/              # 视频模块类型 + 客户端 API 封装
│   ├── video_postprocess.py    # ffmpeg 通用剪辑模板（端到端）⚠️ line 66-69 ffmpeg env 优先
│   ├── video-task-store.ts # localStorage 任务状态持久化
│   ├── runninghub_client.py    # RunningHub 远程工作流客户端
│   ├── credit.py           # 积分账本
│   └── auth.py             # 邮箱 Magic Link 认证
├── main.py                 # FastAPI 后端（视频生成、剪辑、积分）
├── electron/               # 🆕 Electron 主进程（TS 编译到 dist-electron/）
│   ├── main.ts             # 应用入口
│   ├── services/           # 子进程管理、激活、托盘、更新、凭证
│   ├── windows/            # 主/向导/日志窗口
│   ├── utils/              # paths / process-tree / crypto
│   └── tsconfig.json
├── resources/              # 🆕 Electron 运行时资源（git 忽略，scripts/build-* 产出）
│   ├── python/             # embeddable Python 3.13 + site-packages + lib/
│   ├── ffmpeg/bin/         # ffmpeg.exe + ffprobe.exe
│   ├── next-standalone/    # .next/standalone
│   ├── bgm/                # 从 assets/bgm/ copy
│   └── main.py             # 从项目根 copy
├── scripts/                # 构建脚本
│   ├── build-python-bundle.mjs
│   ├── build-next-standalone.mjs
│   ├── extract-ffmpeg.mjs
│   ├── preflight.mjs
│   └── dev-electron.mjs
├── build/                  # electron-builder 中间产物（gitignore）
├── electron-builder.yml    # 🆕 NSIS 打包配置
├── tests/                  # pytest + node:test
├── assets/                 # 静态资源
│   └── bgm/                # 视频剪辑 BGM 素材库（mp3）
├── tools/ffmpeg/bin/       # 本地 ffmpeg / ffprobe（可选）
├── docs/deploy/              # 部署与打包文档
├── .env / .env.local       # 运行时配置（git 忽略）
├── .env.example            # 配置模板（git 跟踪）
└── CLAUDE.md               # 本文件
```

---

## 文件分类清单

> 按「核心业务链路」「附加工具」「运行环境配置」三类标注全量文件，
> 接手者可直接按分类定位。分类依据：文件在业务请求链路中的角色、是否可替换/可选、是否为运行时配置。

### 🧠 核心业务链路代码

> 这些文件承载端到端用户请求——修改前必须理解调用链上下游，测试覆盖率以此为基准。

#### FastAPI 后端（Python）

| 文件 | 职责 | 被依赖方 |
|---|---|---|
| [main.py](main.py) | **FastAPI 入口**：视频生成/剪辑/分享管线、积分账本 HTTP 接口、RunningHub 回调、IP 定位等 AI 业务；`_set_stage` stage 追踪系统 | 所有前端 `fetch()` 调用 |
| [lib/auth.py](lib/auth.py) | 邮箱 Magic Link 认证、会话管理、密码哈希 | `app/api/auth/*` |
| [lib/credit.py](lib/credit.py) | 积分账本（注册赠送、消费校验、兑换码生成/核销） | `app/api/credit/*` + `main.py` 视频消费 |
| [lib/db.py](lib/db.py) | SQLite 数据库连接 + 表初始化（accounts / credit_ledger / redeem_codes） | `lib/auth.py` / `lib/credit.py` |
| [lib/email.py](lib/email.py) | Resend 邮件投递（Magic Link、验证码） | `lib/auth.py` |
| [lib/runninghub_client.py](lib/runninghub_client.py) | RunningHub 远程工作流客户端（提交任务、轮询、下载、`_pick_first_valid_url`） | `main.py` 视频管线 |
| [lib/video_postprocess.py](lib/video_postprocess.py) | **ffmpeg 通用剪辑模板**（数字人口播）：字幕烧录、BGM 混音、名片叠加；`TEMPLATE_CONFIG`、`_build_ffmpeg_command` | `main.py:_run_post_process` |
| [lib/image_video_postprocess.py](lib/image_video_postprocess.py) | 图文视频 ffmpeg 渲染（xfade 转场链、字幕、BGM）；335 行全量实现 | `main.py:1418`（同步，待改异步） |
| [lib/mashup_video_postprocess.py](lib/mashup_video_postprocess.py) | 视频混剪 ffmpeg 渲染（xfade 转场链、字幕、BGM）；364 行全量实现 | `main.py`（同步，待改异步） |
| [lib/subtitle_generator.py](lib/subtitle_generator.py) | ASS 字幕生成（段落切分、语义换行、时间轴分配） | 3 个 postprocess 模块 |
| [lib/video_extract.py](lib/video_extract.py) | 视频帧/音频提取、阿里云 NLS 录音文件识别（ASR 文案提取） | `main.py` + 前端文案提取 |
| [lib/promo_video_service.py](lib/promo_video_service.py) | 推广视频服务（ai_video 合成） | `routes/promo_video_routes.py` |
| [lib/crypto_utils.py](lib/crypto_utils.py) | 加密工具（AES、哈希） | `lib/auth.py` |
| [lib/rate_limit.py](lib/rate_limit.py) | 请求频率限制 | `main.py` |
| [lib/douyin_login.py](lib/douyin_login.py) | 抖音登录集成 | `main.py` 抖音相关 |
| [routes/promo_video_routes.py](routes/promo_video_routes.py) | 推广视频 API 路由（已拆分但**未注册到 main.py**） | — |

#### Next.js API Routes（TypeScript，直连 AI / 不经过 FastAPI）

| 文件 | 职责 |
|---|---|
| [app/api/ai/chat-stream/route.ts](app/api/ai/chat-stream/route.ts) | AI 对话流（SSE），直连 DeepSeek |
| [app/api/ai/rewrite/route.ts](app/api/ai/rewrite/route.ts) | 热点文案重写 |
| [app/api/ai/ark-images/route.ts](app/api/ai/ark-images/route.ts) | 火山方舟图像生成 + 识图/多模态 |
| [app/api/ai/ip-positioning/route.ts](app/api/ai/ip-positioning/route.ts) | IP 定位报告生成 |
| [app/api/ai/ip-diagnosis/route.ts](app/api/ai/ip-diagnosis/route.ts) | IP 诊断分析 |
| [app/api/ai/ip-competitor-scan/route.ts](app/api/ai/ip-competitor-scan/route.ts) | IP 竞争对手扫描 |
| [app/api/ai/ip-viral-analysis/route.ts](app/api/ai/ip-viral-analysis/route.ts) | IP 病毒式传播分析 |
| [app/api/ai/positioning-chat/route.ts](app/api/ai/positioning-chat/route.ts) | 定位策略对话 |
| [app/api/ai/positioning-evaluate/route.ts](app/api/ai/positioning-evaluate/route.ts) | 定位效果评估 |
| [app/api/ai/positioning-product-chat/route.ts](app/api/ai/positioning-product-chat/route.ts) | 产品定位对话 |
| [app/api/ai/memory-extract/route.ts](app/api/ai/memory-extract/route.ts) | 对话用户记忆提取 |
| [app/api/agent/chat/route.ts](app/api/agent/chat/route.ts) | Agent 系统聊天端点 |

#### Next.js API Routes（Auth / Credit / Trends / Video — 中继到 FastAPI 或自处理）

| 文件 | 职责 |
|---|---|
| [app/api/auth/login/route.ts](app/api/auth/login/route.ts) | 密码登录 |
| [app/api/auth/logout/route.ts](app/api/auth/logout/route.ts) | 登出 |
| [app/api/auth/me/route.ts](app/api/auth/me/route.ts) | 当前用户信息 |
| [app/api/auth/register/route.ts](app/api/auth/register/route.ts) | 注册 |
| [app/api/auth/send-link/route.ts](app/api/auth/send-link/route.ts) | 发送邮箱验证码 |
| [app/api/auth/verify-token/route.ts](app/api/auth/verify-token/route.ts) | 验证邮箱 token |
| [app/api/credit/balance/route.ts](app/api/credit/balance/route.ts) | 查询积分余额 |
| [app/api/credit/consume/route.ts](app/api/credit/consume/route.ts) | 消费积分 |
| [app/api/credit/ledger/route.ts](app/api/credit/ledger/route.ts) | 交易流水 |
| [app/api/credit/redeem/route.ts](app/api/credit/redeem/route.ts) | 兑换充值码 |
| [app/api/credit/redeem-codes/route.ts](app/api/credit/redeem-codes/route.ts) | 充值码 CRUD（管理员） |
| [app/api/credit/redeem-codes/generate/route.ts](app/api/credit/redeem-codes/generate/route.ts) | 批量生成充值码 |
| [app/api/credit/admin/verify/route.ts](app/api/credit/admin/verify/route.ts) | 管理员验证 |
| [app/api/credit/admin/logout/route.ts](app/api/credit/admin/logout/route.ts) | 管理员登出 |
| [app/api/trends/fetch/route.ts](app/api/trends/fetch/route.ts) | 获取单个热点源 |
| [app/api/trends/fetch-all/route.ts](app/api/trends/fetch-all/route.ts) | 获取所有热点源 |
| [app/api/trends/fetch-board/route.ts](app/api/trends/fetch-board/route.ts) | 热点看板 |
| [app/api/video/clone-voice/route.ts](app/api/video/clone-voice/route.ts) | 语音克隆 |
| [app/api/video/edit/route.ts](app/api/video/edit/route.ts) | 视频编辑 |
| [app/api/video/generate/route.ts](app/api/video/generate/route.ts) | 数字人视频生成 |
| [app/api/video/status/route.ts](app/api/video/status/route.ts) | 视频任务状态查询 |

#### Next.js 页面（App Router）

| 文件 | 职责 |
|---|---|
| [app/layout.tsx](app/layout.tsx) | 根布局（HTML shell + 主题提供者） |
| [app/page.tsx](app/page.tsx) | 主页（仪表板/落地） |
| [app/auth/verify/page.tsx](app/auth/verify/page.tsx) | 邮箱验证页面 |
| [app/admin/credit/page.tsx](app/admin/credit/page.tsx) | 积分管理后台 |

#### 核心 React 组件（业务页面级）

| 文件 | 职责 | 关联后端 |
|---|---|---|
| [components/video-creation-workflow.tsx](components/video-creation-workflow.tsx) | **数字人口播主流程**（sidebar: "数字人口播"，view key: "视频创作"） | `main.py:POST /api/video/generate` |
| [components/image-video-workflow.tsx](components/image-video-workflow.tsx) | 图文视频工作流（待改轮询） | `main.py:POST /api/video/image-to-video` |
| [components/mashup-video-workflow.tsx](components/mashup-video-workflow.tsx) | 视频混剪工作流（待改轮询） | `main.py:POST /api/video/mashup` |
| [components/promo-video-workflow.tsx](components/promo-video-workflow.tsx) | 推广视频工作流 | `routes/promo_video_routes.py` |
| [components/chat-workspace.tsx](components/chat-workspace.tsx) | AI 对话工作区 | `app/api/ai/chat-stream` |
| [components/copywriting-chat-workspace.tsx](components/copywriting-chat-workspace.tsx) | 文案对话工作区 | `app/api/ai/rewrite` |
| [components/copywriting-view.tsx](components/copywriting-view.tsx) | 文案查看器 | — |
| [components/copywriting-extract-view.tsx](components/copywriting-extract-view.tsx) | 文案提取视图 | `main.py` 视频提取 |
| [components/ip-positioning-report.tsx](components/ip-positioning-report.tsx) | ⚠ 注：实际在 `lib/ip-positioning-report.ts` | `app/api/ai/ip-positioning` |
| [components/ip-competitor-scan.tsx](components/ip-competitor-scan.tsx) | IP 竞品扫描面板 | `app/api/ai/ip-competitor-scan` |
| [components/ip-viral-analysis.tsx](components/ip-viral-analysis.tsx) | IP 病毒传播分析面板 | `app/api/ai/ip-viral-analysis` |
| [components/positioning-chat-dialog.tsx](components/positioning-chat-dialog.tsx) | 定位对话弹窗 | `app/api/ai/positioning-chat` |
| [components/dashboard-view.tsx](components/dashboard-view.tsx) | 仪表板主视图 | — |
| [components/dashboard-ai-insights.tsx](components/dashboard-ai-insights.tsx) | 仪表板 AI 洞察 | — |
| [components/dashboard-data-panel.tsx](components/dashboard-data-panel.tsx) | 仪表板数据面板 | — |
| [components/dashboard-quick-actions.tsx](components/dashboard-quick-actions.tsx) | 仪表板快捷操作 | — |
| [components/dashboard-sidebar.tsx](components/dashboard-sidebar.tsx) | 仪表板侧边栏 | — |
| [components/admin-credit-view.tsx](components/admin-credit-view.tsx) | 管理员积分管理 | `app/api/credit/redeem-codes` |
| [components/credit-recharge-view.tsx](components/credit-recharge-view.tsx) | 积分充值界面 | `app/api/credit/redeem` |
| [components/account-binding.tsx](components/account-binding.tsx) | 账号绑定（邮箱/密码） | `app/api/auth/*` |
| [components/account-positioning.tsx](components/account-positioning.tsx) | 账号定位面板 | — |
| [components/agent-center.tsx](components/agent-center.tsx) | Agent 中心 | `app/api/agent/chat` |
| [components/hot-topics.tsx](components/hot-topics.tsx) | 热点话题展示 | `app/api/trends/fetch-all` |
| [components/share-distribute.tsx](components/share-distribute.tsx) | 分享分发面板 | `main.py:share_generate` |
| [components/video-history.tsx](components/video-history.tsx) | 视频历史列表 | `app/api/video/status` |
| [components/settings-view.tsx](components/settings-view.tsx) | 设置页面 | — |
| [components/help-center-view.tsx](components/help-center-view.tsx) | 帮助中心 | — |
| [components/plan-route-view.tsx](components/plan-route-view.tsx) | 计划路线视图 | — |

#### 核心 TypeScript 库（前端业务逻辑）

| 文件 | 职责 |
|---|---|
| [lib/deepseek-chat.ts](lib/deepseek-chat.ts) | DeepSeek AI 对话 API 封装 |
| [lib/ark-chat-completion.ts](lib/ark-chat-completion.ts) | 火山方舟 ARK 聊天补全 SDK |
| [lib/ark-images-api.ts](lib/ark-images-api.ts) | ARK 图像生成 API 调用 |
| [lib/ark-images-client.ts](lib/ark-images-client.ts) | ARK 图像客户端 |
| [lib/tianapi-trends.ts](lib/tianapi-trends.ts) | 天行 API 全网热搜客户端 |
| [lib/fastapi-base.ts](lib/fastapi-base.ts) | FastAPI 基础 URL 配置（`NEXT_PUBLIC_FASTAPI_URL`） |
| [lib/video/api.ts](lib/video/api.ts) | 视频模块客户端 API（generate / status / edit / clone-voice） |
| [lib/video/types.ts](lib/video/types.ts) | 视频模块 TypeScript 类型 |
| [lib/video/constants.ts](lib/video/constants.ts) | 视频模块常量 |
| [lib/video/utils.ts](lib/video/utils.ts) | 视频工具函数 |
| [lib/video/video-prompt-presets.ts](lib/video/video-prompt-presets.ts) | 视频提示预设 |
| [lib/video/storage.ts](lib/video/storage.ts) | 视频存储管理 |
| [lib/video-task-runtime.ts](lib/video-task-runtime.ts) | 数字人口播任务运行时（轮询 + stage 推进） |
| [lib/video-task-store.ts](lib/video-task-store.ts) | localStorage 任务持久化（排除 base64 大字段） |
| [lib/video-cover-ui.ts](lib/video-cover-ui.ts) | 视频封面 UI 逻辑 |
| [lib/video-preview-embed.ts](lib/video-preview-embed.ts) | 视频预览嵌入 |
| [lib/cost-tracker.ts](lib/cost-tracker.ts) | API 调用成本追踪 |
| [lib/credit-types.ts](lib/credit-types.ts) | 积分系统类型定义 |
| [lib/server-env.ts](lib/server-env.ts) | 服务端环境变量 |
| [lib/user-memory.ts](lib/user-memory.ts) | 用户记忆存储 |
| [lib/copywriting-script-format.ts](lib/copywriting-script-format.ts) | 文案脚本格式化 |
| [lib/ip-positioning-report.ts](lib/ip-positioning-report.ts) | IP 定位报告生成 |
| [lib/global-search.ts](lib/global-search.ts) | 全局搜索逻辑 |
| [lib/hotspot-insight-variants.ts](lib/hotspot-insight-variants.ts) | 热点洞察变体 |
| [lib/publish-time.ts](lib/publish-time.ts) | 发布时机工具 |
| [lib/image-base64.ts](lib/image-base64.ts) | 图片 Base64 编解码 |
| [lib/download-image.ts](lib/download-image.ts) | 图片下载工具 |
| [lib/generated-image-archive.ts](lib/generated-image-archive.ts) | 生成图片归档 |
| [lib/team-agents.ts](lib/team-agents.ts) | 团队 Agent 定义 |
| [lib/theme-init-script.ts](lib/theme-init-script.ts) | 主题初始化脚本 |
| [lib/utils.ts](lib/utils.ts) | 通用工具函数（`cn()`、格式化等） |
| [lib/prompts/copywriting-agent-systems.ts](lib/prompts/copywriting-agent-systems.ts) | 文案 Agent 系统提示词 |
| [lib/prompts/copywriting-workflow-knowledge.ts](lib/prompts/copywriting-workflow-knowledge.ts) | 文案工作流知识 |
| [lib/prompts/hotspot-rewrite-system.ts](lib/prompts/hotspot-rewrite-system.ts) | 热点重写系统提示词 |
| [lib/prompts/ip-positioning-prompts.ts](lib/prompts/ip-positioning-prompts.ts) | IP 定位提示词 |

#### Electron 桌面壳（核心）

| 文件 | 职责 |
|---|---|
| [electron/main.ts](electron/main.ts) | **Electron 主进程入口**：窗口创建、bootstrap（dev/prod 分支）、子进程生命周期 |
| [electron/preload.ts](electron/preload.ts) | 预加载脚本（安全 IPC 桥） |
| [electron/services/child-process-manager.ts](electron/services/child-process-manager.ts) | 子进程管理（启动/停止 Python uvicorn + Next.js standalone） |
| [electron/services/activation-client.ts](electron/services/activation-client.ts) | 中央激活验证客户端 |
| [electron/services/env-injector.ts](electron/services/env-injector.ts) | 环境变量注入（API Key / ffmpeg 路径等） |
| [electron/services/tray-controller.ts](electron/services/tray-controller.ts) | 系统托盘控制器 |
| [electron/services/updater.ts](electron/services/updater.ts) | 自动更新（electron-updater → GitHub Releases） |
| [electron/services/credential-store.ts](electron/services/credential-store.ts) | 凭据安全存储 |
| [electron/services/logger.ts](electron/services/logger.ts) | Electron 日志 |
| [electron/services/log-collector.ts](electron/services/log-collector.ts) | 日志收集 |
| [electron/services/auto-launch.ts](electron/services/auto-launch.ts) | 开机自启 |
| [electron/services/machine-id.ts](electron/services/machine-id.ts) | 机器 ID 获取 |
| [electron/services/env-loader.ts](electron/services/env-loader.ts) | 环境加载器 |
| [electron/utils/paths.ts](electron/utils/paths.ts) | 路径工具 |
| [electron/utils/port-finder.ts](electron/utils/port-finder.ts) | 空闲端口查找 |
| [electron/utils/process-tree.ts](electron/utils/process-tree.ts) | 进程树管理 |
| [electron/utils/crypto.ts](electron/utils/crypto.ts) | 加密工具 |
| [electron/windows/wizard-window.ts](electron/windows/wizard-window.ts) | 设置向导窗口（首次启动） |

#### Remotion 视频渲染

| 文件 | 职责 |
|---|---|
| [remotion/index.ts](remotion/index.ts) | Remotion 导出/注册入口 |
| [remotion/Root.tsx](remotion/Root.tsx) | Remotion 根组合 |
| [remotion/EditingComposition.tsx](remotion/EditingComposition.tsx) | 编辑流程视频组合 |

---

### 🔧 附加工具

> 这些文件是项目运行的辅助支撑——它们不在核心请求链路上，可独立替换或移除而不影响业务逻辑。

#### FFmpeg 二进制（视频处理引擎）

| 文件 | 说明 |
|---|---|
| [tools/ffmpeg/bin/ffmpeg.exe](tools/ffmpeg/bin/ffmpeg.exe) | ffmpeg 视频编解码（仓库内自备，部署必检） |
| [tools/ffmpeg/bin/ffprobe.exe](tools/ffmpeg/bin/ffprobe.exe) | ffprobe 媒体信息探测 |
| [tools/ffmpeg/ffmpeg.zip](tools/ffmpeg/ffmpeg.zip) | ffmpeg 源码/二进制压缩包 |
| [resources/ffmpeg/bin/ffmpeg.exe](resources/ffmpeg/bin/ffmpeg.exe) | Electron 打包用 ffmpeg（从 tools copy） |
| [resources/ffmpeg/bin/ffprobe.exe](resources/ffmpeg/bin/ffprobe.exe) | Electron 打包用 ffprobe |

#### 构建与打包脚本（`scripts/`）

| 文件 | 说明 |
|---|---|
| [scripts/build-next-standalone.mjs](scripts/build-next-standalone.mjs) | 构建 Next.js standalone 产物（→ `resources/next-standalone/`） |
| [scripts/build-python-bundle.mjs](scripts/build-python-bundle.mjs) | 打包嵌入式 Python 3.13 + site-packages（→ `resources/python/`） |
| [scripts/extract-ffmpeg.mjs](scripts/extract-ffmpeg.mjs) | 从 ZIP 解压 ffmpeg 二进制 |
| [scripts/preflight.mjs](scripts/preflight.mjs) | **出包前校验**：检查 `resources/` 下所有产物齐全 |
| [scripts/dev-electron.mjs](scripts/dev-electron.mjs) | 开发模式启动 Electron |
| [scripts/patch-next-themes.mjs](scripts/patch-next-themes.mjs) | 补丁 next-themes 兼容性 |
| [scripts/clean-cache.mjs](scripts/clean-cache.mjs) | 清理缓存文件 |
| [scripts/dev-fix.mjs](scripts/dev-fix.mjs) | 开发环境修复 |
| [scripts/init_credit_db.py](scripts/init_credit_db.py) | 初始化积分数据库表 |
| [scripts/reconcile.py](scripts/reconcile.py) | 数据协调/修复工具 |

#### 测试工具与 E2E

| 文件 | 说明 |
|---|---|
| [tools/run_e2e_template_test.py](tools/run_e2e_template_test.py) | 端到端模板测试运行器 |
| [tools/run_template_test.py](tools/run_template_test.py) | 模板测试运行器 |
| [tests/conftest.py](tests/conftest.py) | Pytest 全局 fixtures |
| [tests/alias-loader.mjs](tests/alias-loader.mjs) | Node.js 测试别名加载器（`@/` → `./`） |
| [tests/test_auth.py](tests/test_auth.py) | 认证流程测试 |
| [tests/test_credit.py](tests/test_credit.py) | 积分系统测试 |
| [tests/test_video_postprocess.py](tests/test_video_postprocess.py) | ffmpeg 剪辑模板测试 |
| [tests/test_video_cover.py](tests/test_video_cover.py) | 视频封面测试 |
| [tests/chat-stream-route.test.ts](tests/chat-stream-route.test.ts) | 对话流 API 测试 |
| [tests/copywriting-oral-script.test.ts](tests/copywriting-oral-script.test.ts) | 口播脚本格式测试 |
| [tests/video-task-runtime.test.ts](tests/video-task-runtime.test.ts) | 视频任务运行时测试 |
| [tests/video-task-store.test.ts](tests/video-task-store.test.ts) | 视频任务存储测试 |
| [tests/video-cover-ui.test.ts](tests/video-cover-ui.test.ts) | 视频封面 UI 测试 |
| [tests/video-prompt-presets.test.ts](tests/video-prompt-presets.test.ts) | 视频提示预设测试 |

#### UI 组件库（shadcn/ui — 第三方封装，非业务代码）

`components/ui/` 下约 50 个文件（`accordion.tsx` ~ `tooltip.tsx`）均为 shadcn/ui + Radix UI 原始组件封装。它们不是本项目业务代码——由 `npx shadcn-ui@latest add` 自动生成，按需修改。

#### 静态资源

| 位置 | 说明 |
|---|---|
| [assets/bgm/](assets/bgm/) | 视频 BGM 素材库（16 首 mp3 + 1 首 boss_voice.mp3） |
| [public/agents/](public/agents/) | Agent 头像（8 位名人） |
| [public/avatar-*.jpg/png](public/) | 用户默认头像素材 |
| [public/placeholder-*](public/) | 占位图 |
| [public/icon-*](public/) | 网站图标 |
| [public/preview-images.html](public/preview-images.html) | 图片预览 HTML |
| [build/icon.ico](build/icon.ico) | Windows 安装程序图标 |
| [build/icon.png](build/icon.png) | 应用图标 |
| [build/installer.nsh](build/installer.nsh) | NSIS 安装程序自定义脚本 |
| [build/tray-icon.png](build/tray-icon.png) | 系统托盘图标 |

#### 辅助 / 一次性脚本

| 文件 | 说明 |
|---|---|
| [logger.js](logger.js) | JavaScript 日志工具 |

#### Claude Code Superpowers 插件（`superpowers-main/`）

第三方 AI 辅助开发 Skills 框架，通过 git submodule 或手动复制引入。不是本项目业务代码。含 13 个 Skills（`brainstorming/` ~ `writing-skills/`）+ 多 IDE 插件配置。

---

### ⚙️ 运行环境配置

> 修改这些文件影响部署形态、运行参数或依赖版本。生产变更需同步 Docker / Electron。

#### 依赖声明

| 文件 | 说明 |
|---|---|
| [package.json](package.json) | Node.js 依赖（Next.js 16 / React 19 / Electron 33 / Remotion / shadcn/ui） + pnpm scripts |
| [pnpm-lock.yaml](pnpm-lock.yaml) | PNPM 依赖锁 |
| [pnpm-workspace.yaml](pnpm-workspace.yaml) | PNPM 工作区 |
| [requirements.txt](requirements.txt) | Python 依赖（FastAPI / httpx / Pillow / python-dotenv 等） |

#### 运行时配置

| 文件 | 说明 |
|---|---|
| [.env](.env) | **实际环境变量**（git 忽略，含 API Key） |
| [.env.example](.env.example) | 环境变量模板（git 跟踪，用于新机器初始化） |
| [next.config.mjs](next.config.mjs) | Next.js 配置（standalone 输出、Remotion serverExternalPackages、30MB serverActions 限制） |
| [tsconfig.json](tsconfig.json) | TypeScript 配置（`@/*` → `./*` 路径别名） |
| [electron/tsconfig.json](electron/tsconfig.json) | Electron TypeScript 配置 |
| [postcss.config.mjs](postcss.config.mjs) | PostCSS 配置（Tailwind v4） |
| [components.json](components.json) | shadcn/ui 配置（New York style / RSC / 别名） |

#### 容器化与部署

| 文件 | 说明 |
|---|---|
| [Dockerfile](Dockerfile) | 主 Docker 构建 |
| [Dockerfile.web](Dockerfile.web) | Next.js web 服务镜像 |
| [Dockerfile.api](Dockerfile.api) | FastAPI api 服务镜像 |
| [docker-compose.yml](docker-compose.yml) | Docker Compose 编排 |
| [zeabur.json](zeabur.json) | Zeabur 平台服务编排 + Volume 绑定 |
| [vercel.json](vercel.json) | Vercel 部署配置 |
| [netlify.toml](netlify.toml) | Netlify 部署配置 |

#### Electron 打包

| 文件 | 说明 |
|---|---|
| [electron-builder.yml](electron-builder.yml) | NSIS 打包配置（appId / 中文语言 / Windows 目标） |

#### 忽略与排除规则

| 文件 | 说明 |
|---|---|
| [.gitignore](.gitignore) | Git 忽略（node_modules / .next / .env / resources/ / build/ / release/） |
| [.gitattributes](.gitattributes) | Git 属性 |
| [.dockerignore](.dockerignore) | Docker 构建排除 |
| [.vercelignore](.vercelignore) | Vercel 部署排除 |

#### 编辑器 / AI 辅助

| 文件 | 说明 |
|---|---|
| [.claude/settings.local.json](.claude/settings.local.json) | Claude Code 本地设置 |
| [.claude/launch.json](.claude/launch.json) | Claude Code 启动配置 |
| [AGENTS.md](AGENTS.md) | AI Agent 配置文档 |
| [CLAUDE.md](CLAUDE.md) | 本文件 — 项目速查表 |

#### 运行时数据（git 忽略）

| 路径 | 说明 |
|---|---|
| `data/accounts.db` | SQLite 用户/积分数据库 |
| `public/video-cache/` | 视频缓存（下载产物、ASR 临时文件） |
| `resources/` | Electron 打包资源（python / ffmpeg / next-standalone / bgm） |
| `build/` | electron-builder 中间产物 |
| `release/` | NSIS 安装包产出 |
| `.electron-cache/` | Electron 构建缓存 |

---

### 双服务架构

| 进程 | 入口 | 职责 |
|---|---|---|
| **Next.js** | `pnpm dev` / `pnpm dev:all` | UI、Auth、积分、Cron、Remotion 渲染 |
| **FastAPI** | `uvicorn main:app` | 视频生成（RunningHub 客户端）、ffmpeg 剪辑、积分账本 |

`app/api/ai/...` 下几个路由直连 DeepSeek，不再走 FastAPI。

---

## 环境变量（运维契约）

> **生产机部署时必须配置的环境变量在此集中登记**。
> 任何新增/修改都同步改 `.env.example` 与本节。

### 读取位置速查

| 变量名 | 读取位置 | 必需 | 用途 |
|---|---|---|---|
| `TIANAPI_KEY` | `main.py:fetch_trends` | ✅ | 全网热搜 API |
| `DEEPSEEK_API_KEY` | `main.py` / `app/api/ai/...` | ✅ | 对话/润色/回退识图 |
| `RUNNINGHUB_API_KEY` | `main.py:_get_rh_client` | ✅ | 数字人视频生成 |
| `NEXT_PUBLIC_FASTAPI_URL` | `lib/fastapi-base.ts` | ✅ 生产 | 浏览器直连 API（视频 static 等） |
| `FASTAPI_URL` | `lib/fastapi-base.ts` | ✅ Docker/PaaS | Next 服务端 proxy 内网地址（如 `http://api:8000`） |
| `EMAIL_HASH_SALT` | `lib/auth.py` | ✅ | 邮箱哈希盐（32 字节 hex）|
| `CREDIT_REGISTER_BONUS` | `lib/credit.py` | ✅ | 注册赠送积分数 |
| `CREDIT_SESSION_TTL_DAYS` | `lib/auth.py` | ✅ | 登录会话有效期 |
| `CREDIT_EMAIL_TOKEN_TTL_SECONDS` | `lib/auth.py` | ✅ | Magic Link 有效期 |
| `CREDIT_ADMIN_ACCESS_KEY` | `main.py:_require_admin_key` | ✅ | 积分后台管理密钥 |
| `RESEND_API_KEY` | `lib/email.py` | ✅ | 邮件投递服务 |
| `RESEND_FROM` | `lib/email.py` | ✅ | 发件人地址（需在 Resend 后台验证）|
| `APP_PUBLIC_BASE` | `lib/email.py` | ✅ | 邮件中拼接的公网回调地址 |
| `DEV_EMAIL_MODE` | `lib/email.py` | ✅ | `1` = 邮件链接打到日志（开发期），`0` = 真实发送 |
| **`VIDEO_BGM_DIR`** | **`main.py:_resolve_bgm_dir`** | **✅** | **视频剪辑 BGM 素材目录，存放 mp3 / wav / aac / m4a** |
| `SEEDANCE_PRIMARY_BASE_URL` / `SEEDANCE_PRIMARY_API_KEY` / `SEEDANCE_PRIMARY_MODEL` | `lib/dh_video_v2_service.py` | 数字人视频创作（新）首选 | 默认 model `sd2-福利`，如 `https://api.7tai.cc`；失败回退 aicost |
| `SEEDANCE_API_KEY` | `lib/dh_video_v2_service.py` | 数字人视频创作（新）备选 | aicost.xyz Seedance 2.0 Fast，`POST /v1/videos` |
| `XINGHE_API_KEY` | 同上 | 星河系列 | aicost.xyz，`POST /v1/video/create` |
| `SEEDANCE_BASE_URL` / `XINGHE_BASE_URL` | 同上 | 可选 | 默认 `https://www.aicost.xyz` |
| `NEWAPI_BASE_URL` | `lib/llm/sonetto-client.ts` | 可选 | aicost NewAPI 基址，默认 `https://www.aicost.xyz`（自动补 `/v1`） |
| `NEWAPI_KEY` | `lib/llm/sonetto-client.ts` | 可选 | GPT + Claude 统一 Key |
| `NEWAPI_GPT_MODEL` | `lib/geo/llm/router.ts` | 可选 | 默认 GPT 模型，默认 `gpt-5.5` |
| `NEWAPI_CLAUDE_MODEL` | `lib/geo/llm/router.ts` | 可选 | 默认 Claude 模型，默认 `claude-opus-4-8`（按次） |
| `SONETTO_*` | 同上 | 已废弃 | 兼容别名，优先读 `NEWAPI_*` |
| `CREDIT_METERED_KEY` | `main.py:consume-metered` / `lib/api/with-auth.ts` | Sonetto 启用时必填 | 计量扣费服务端密钥（浏览器不可见） |
| `ARK_API_KEY` | `app/api/ai/ark-images/route.ts` / GEO 豆包 | 可选 | 火山方舟 API Key |
| `ARK_CHAT_MODEL` | `lib/geo/llm/router.ts` / chat-stream | 可选 | 豆包预置模型，默认 `doubao-seed-2-1-pro-260628` |
| `ARK_ENDPOINT_ID` | 同上 | 可选 | 多模态接入点 ID |
| `ARK_BASE_URL` | 同上 | 可选 | 火山方舟 API 地域端点 |
| `ARK_IMAGE_ENDPOINT_ID` | `app/api/ai/ark-images/route.ts` | 可选 | 生图接入点 ID |
| `ARK_IMAGE_API_KEY` | 同上 | 可选 | 生图专用 API Key |
| `POSITIONING_PRODUCT_ARK_ENDPOINT_ID` | 身份定位·产品档案 | 可选 | 人设专用豆包端点 |
| `POSITIONING_PRODUCT_ARK_API_KEY` | 同上 | 可选 | 人设专用 API Key |
| `DEEPSEEK_CHAT_MODEL` | DeepSeek 调用 | 可选 | 默认 `deepseek-v4-pro` |
| `SHARE_BASE_URL` | `main.py:share_generate` | 可选 | 一键分发分享链接基地址 |
| `FASTAPI_URL` | 客户端连 FastAPI | 可选 | 默认 `http://127.0.0.1:8000` |
| `CORS_ALLOW_ORIGINS` | `main.py` | 可选 | 跨域白名单，逗号分隔 |
| `SHARE_API_TOKEN` | 生产环境 share API | 生产必填 | 分享 API Bearer Token |

| `CREDIT_DB_OVERRIDE` | `lib/db.py` | 生产推荐 | SQLite 数据库文件路径（默认 `<project>/data/accounts.db`）|
| `DATA_DIR` | `main.py` | 生产推荐 | 上传文件 / 视频缓存持久化根目录（默认 `<project>/public/video-cache`）|
| **`ALIYUN_ACCESS_KEY_ID`** | `lib/video_extract.py` | 文案提取 | 阿里云 RAM AccessKey ID（NLS 录音文件识别）|
| **`ALIYUN_ACCESS_KEY_SECRET`** | `lib/video_extract.py` | 文案提取 | 阿里云 RAM AccessKey Secret |
| **`ALIYUN_ASR_APP_KEY`** | `lib/video_extract.py` | 文案提取 | 阿里云智能语音交互项目 AppKey |

### Electron 桌面打包相关（2026-06-24+）

| 变量名 | 读取位置 | 必需 | 用途 |
|---|---|---|---|
| **`CENTRAL_KEY_POOL_JSON`** | `main.py`（中央激活服务） | 桌面客户端启用后 | 密钥池 JSON，按 plan 分组：`{"standard":{"DEEPSEEK_API_KEY":"...","RUNNINGHUB_API_KEY":"..."}}` |
| `CENTRAL_LATEST_VERSION` | `main.py` | 桌面客户端启用后 | 当前最新版本号，用于版本检查 |
| `CENTRAL_FORCE_UPDATE_BELOW` | `main.py` | 可选 | 低于此版本强制升级，默认 `0.0.1` |
| `CENTRAL_UPDATE_URL` | `main.py` | 可选 | GitHub Releases URL |

### 关键环境变量详解

#### `VIDEO_BGM_DIR`（视频剪辑 BGM 目录）

- **读取位置**：`main.py:_resolve_bgm_dir()`
- **解析顺序**：
  1. 前端请求 `EditVideoRequest.bgm_dir`（暂未启用）
  2. `os.getenv("VIDEO_BGM_DIR")` ← 本变量
  3. 返回 `None`（剪辑失败："未配置 BGM 目录"）
- **目录要求**：必须存在，文件名后缀为 `.mp3 / .wav / .aac / .m4a`
- **开发期默认**：`assets/bgm`（仓库内置 16 个 BGM + 1 个 boss_voice.mp3）
- **生产机推荐**：改为绝对路径，例如 `/opt/agenthub/bgm` 或 `/data/bgm`
- **配套逻辑**：[lib/video_postprocess.py:_pick_bgm_for_duration](lib/video_postprocess.py) 会按视频裁剪时长选最接近的 BGM；超长则自动 `-c copy` 截断

#### `DEEPSEEK_API_KEY` / `RUNNINGHUB_API_KEY`

- 这两个是项目最关键的两个 AI 服务 Key，缺一不可
- 各自配错会触发 503 错误并在 `main.py` / `app/api/ai/...` 抛 `HTTPException`
- ⚠️ `main.py` 使用 `load_dotenv(override=True)` 确保 `.env` 值优先于 Windows 系统环境变量；若发现实际调用的 Key 与 `.env` 不一致，检查 Windows 用户环境变量是否残留旧值

#### `CREDIT_ADMIN_ACCESS_KEY`

- 用于 `/api/credit/redeem-codes` 等积分管理后台接口
- 前端 `app/admin/credit/page.tsx` 通过 `X-Admin-Key` 头传递
- **必须**用强随机：`python -c "import secrets; print(secrets.token_urlsafe(24))"`

### Docker 部署（Zeabur / 任意容器平台）

| 服务 | Dockerfile | 端口 | 职责 |
|---|---|---|---|
| **web** | [Dockerfile.web](Dockerfile.web) | `3000` | Next.js standalone |
| **api** | [Dockerfile.api](Dockerfile.api) | `8000` | FastAPI（视频生成 / ffmpeg 剪辑 / 积分账本）|

**关键配置文件**：[zeabur.json](zeabur.json)（服务编排 + Volume 绑定），[.dockerignore](.dockerignore)（排除 node_modules / .next / pycache）。

**容器内环境变量**：`FASTAPI_URL=http://api:8000`（web 服务端 proxy），`NEXT_PUBLIC_FASTAPI_URL=https://api.你的域名.com`（浏览器公网），`DATA_DIR=/data` + `CREDIT_DB_OVERRIDE=/data/accounts.db` + `VIDEO_BGM_DIR=/app/assets/bgm`（api Volume 持久化）。部署手册见 [docs/deploy/PAAS.md](docs/deploy/PAAS.md)。

**本地 Docker 测试**：
```bash
docker build -f Dockerfile.api -t zhongtai-api . && docker run -p 8000:8000 -v zhongtai-data:/data -e DEEPSEEK_API_KEY=sk-xxx -e RUNNINGHUB_API_KEY=xxx zhongtai-api
docker build -f Dockerfile.web -t zhongtai-web . && docker run -p 3000:3000 -e NEXT_PUBLIC_FASTAPI_URL=http://host.docker.internal:8000 zhongtai-web
```

### 生产机部署检查清单

- [ ] `cp .env.example .env` 并填入真实 Key
- [ ] `VIDEO_BGM_DIR` 改为生产机绝对路径
- [ ] 确认 `tools/ffmpeg/bin/` 下有 `ffmpeg.exe` / `ffprobe.exe`（或系统 PATH 含 ffmpeg）
- [ ] `EMAIL_HASH_SALT` 用 `secrets.token_hex(32)` 生成并填入
- [ ] `CREDIT_ADMIN_ACCESS_KEY` 改强随机
- [ ] `DEV_EMAIL_MODE=0`（生产必须）
- [ ] `APP_PUBLIC_BASE` 改为生产域名
- [ ] `SHARE_API_TOKEN` 配置（如启用一键分享）
- [ ] `CORS_ALLOW_ORIGINS` 配置生产前端域名
- [ ] `RESEND_FROM` 改为已验证的域名地址

---

## 视频生成架构（2026-06-25 重构，2026-07-02 分段管线）

### 数字人口播分段管线（P2，2026-07-02）

`POST /api/video/generate` 在音频克隆完成后：

```text
下载克隆音频 → ffmpeg 按 20s 切段（上限 30 段）
  → 扣费：50（克隆）+ 250×n（视频段）
  → 逐段上传 RH → asyncio.gather 并发 submit_video（Workflow 2072599683289141249，5 行 prompt）
  → 返回 task_id=vg_*（local_task_id）
  → 后台 _run_dh_segment_pipeline(local_task_id):
      并发轮询 n 段 RH → 下载 segment_{idx}.mp4
      → concatenate_videos_ffmpeg → concat.mp4
      → status=success（半成品，不自动 _run_post_process）
      → 用户手动 POST /api/video/edit 进入自动剪辑
```

关键设计：

- `_task_store` 主键为 `local_task_id`（`vg_*`），batch 字段：`segment_count` / `segments_completed` / `rh_video_task_ids`
- 产物路径：`{DATA_DIR}/video-cache/generated/{vg_*}/concat.mp4`，对外 URL `/static/video-generated/...`
- `_dh_pipeline_tasks` 追踪分段管线；`video_cancel` 同时取消 pipeline task
- `_poll_video_task` 保留供旧任务兼容，新管线不再使用
- `RH_VIDEO_INSTANCE_TYPE` 环境变量可覆盖 RH 视频工作流 `instanceType`（默认 `default`）

### 数字人口播积分定价（2026-07-03）

| 项目 | 常量 | 单价 | 扣费时机 |
|------|------|------|----------|
| 音色克隆 | `VIDEO_CLONE_VOICE_COST` | **50** 积分/次 | 切段成功后、提交 RH 视频前（`ref_id={task_id}:clone`） |
| 视频生成 | `VIDEO_SEGMENT_COST` | **250** 积分/段（20s） | 同上（`ref_id={task_id}:video`，总额 = 250×段数） |

- 独立接口 `POST /api/video/clone-voice`：提交 RH 前扣 50，响应含 `ref_id`
- 扣费 helper：`lib/api_auth.py` → `consume_voice_clone()` / `consume_video_creation_segments()`
- `_task_store` 记录 `credit_clone_cost` / `credit_video_cost` 便于对账
- 克隆或切段失败不扣费；扣费后 RH 失败暂不自动退款

### 异步管线（P1，历史参考）

早期单次 RH 工作流 + `_poll_video_task` + 自动 `_run_post_process` 模式已被上述分段管线替代。

### 运行实例 `instanceType`

`lib/runninghub_client.py` — 数字人视频 `submit_video` 默认 `instanceType: "default"`（24G）；音频克隆 AI App 仍为 `plus`；可通过 `RH_VIDEO_INSTANCE_TYPE` 覆盖视频实例类型。

### Stage 追踪系统（P0）

`main.py` 中定义 12 个 stage 常量（`STAGE_UPLOADING_IMAGE` ~ `STAGE_CANCELLED`），通过 `_set_stage(task_id, stage, **extras)` 原子写入。`TaskStatusResponse` 暴露 `stage` / `stage_label` / `stage_history` / `stage_updated_at` 四个字段，前端可读条展示当前进度。

### RunningHub 结果安全解析

- `main.py:_pick_first_result_url(result: dict) -> str` — 从完整响应中提取第一个有效 URL，防御 `results` 为 None/null/[None]/[]
- `lib/runninghub_client.py:_pick_first_valid_url(results) -> str|None` — 从 results 列表中安全提取
- `wait_for_completion` **不再无条件信任 SUCCESS** — 必须 `_pick_first_valid_url` 非空才返回，否则最多重试 10 次（50s CDN 缓冲）

### 封面图

- `_run_cover_generation` 使用 `_set_stage` 写状态，`max_wait=600`（10 min）
- `build_cover_prompt(gender, script="")` 生成抖音竖屏封面 prompt，结合视频脚本文案前 60 字

### localStorage 持久化策略

`lib/video-task-store.ts` 定义了 `NON_PERSISTENT_FIELDS` = `[imageBase64, imagePreview, audioBase64, qrDataUrl]`。这些字段仅保留在内存中，不入 localStorage。写入体积从 ~14MB 降至 <1KB，解决 QuotaExceededError。

### 进度条假读

`_poll_video_task` 内置独立的 `_tick_progress()` 计时器，每 15 秒按 `已过时间 / 25min × 95%` 更新 `progress` 字段，前端不再卡 0%。

### 注意事项

- ✅ `load_dotenv(override=True)` — **必须保留**，否则 Windows 系统环境变量会覆盖 `.env` 中的 API Key
- ✅ 所有 RunningHub API 响应解析**必须**用 `d.get("key") or default` 而非 `d.get("key", default)`，因为 key 存在但值为 null 时默认值不生效
- ⚠️ `_task_store` 是内存 dict，FastAPI 重启后清空（P2 计划用 Redis 替代）
- ⚠️ 不要往 `_set_stage` 或 `_task_store` 里存 base64 数据（用完即清）
- ⚠️ 修改 `wait_for_completion`、`_pick_first_result_url`、`_set_stage` 等共享函数时，同时影响 4 个视频 endpoint

---

## 视频剪辑模板（ffmpeg 通用模板）

> 单模板 (`default` / "默认剪辑") 设计；任何新增模板应改 `lib/video_postprocess.py:TEMPLATE_CONFIG` 与 `_build_ffmpeg_command`。

### 模板文件位置

- **核心模块**：[lib/video_postprocess.py](lib/video_postprocess.py)
- **端到端入口**：`render_video_with_template(*, task_id, output_dir, script, business_card_text, bgm_dir, bgm_volume, input_video_path, ...)`
- **FFmpeg 命令拼装**：`_build_ffmpeg_command()`
- **BGM 选取**：`_pick_bgm_for_duration(bgm_dir, target_duration)`
- **BGM 截断**：`_trim_bgm(bgm_path, target_duration, output_dir)`

### 模板配置（`TEMPLATE_CONFIG`）

```python
TEMPLATE_CONFIG = {
    "voice_volume": 1.0,
    "bgm_fade_in_sec": 1.0,
    "bgm_fade_out_sec": 2.0,
    "video_codec": "libx264",
    "video_preset": "fast",
    "audio_codec": "aac",
    "threads": "4",
    "subtitle_fontsize": 40,
    "card_fontsize": 17,
    "card_line_height": 21,
    "card_padding": 20,
    "card_color": "white",
    "card_border_color": "black@0.8",
    "card_border_w": 2,
}
```

### 字幕语义化切分

- **段落级**（一句一字幕）：`split_script_segments` 只切 `。！？\n`
- **行内级**（长字幕内换行）：`_auto_wrap` 优先按 `，` `、` 切分，找不到才硬切 24 字
- **行内级标记**：`_SUBTITLE_LINE_BREAK_RE = r"[，、]"`

### BGM 时长匹配策略

1. 遍历 BGM 目录，ffprobe 探测每首时长
2. 计算 `|bgm_duration - target_duration|`，选最小的那首
3. 若 `bgm_duration > target_duration * 1.05`，自动 `ffmpeg -t -c copy` 截断到目标时长
4. 截断后跳过 `-stream_loop -1`（提升渲染速度）

---

## 桌面打包（Electron 33）

> 详见 [docs/deploy/ELECTRON-BUILD.md](docs/deploy/ELECTRON-BUILD.md) 与 [docs/deploy/CENTRAL-ACTIVATION.md](docs/deploy/CENTRAL-ACTIVATION.md)。

### 形态

- **客户端**：Electron 33 + Node 20 + 内嵌 Next.js standalone + embeddable Python 3.13
- **平台**：仅 Windows（NSIS 安装包）
- **激活**：MVP 阶段就做激活码机制
- **更新**：electron-updater 走 GitHub Releases

### ffmpeg 路径修正

`lib/video_postprocess.py:66-74` 的 `_FFMPEG_EXE` / `_FFPROBE_EXE` 现在**优先读环境变量**：

```python
_FFMPEG_EXE = os.environ.get("FFMPEG_EXE") or (
    str(_LOCAL_FFMPEG_BIN / "ffmpeg.exe") if (_LOCAL_FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"
)
```

桌面打包时 Electron 主进程注入绝对路径，避免每台机器都依赖 `tools/ffmpeg/bin/`。**这是为什么 line 66-69 必须用 env 的原因**。

### 端口策略

- Next.js 跑 **3010**
- uvicorn 跑 **8010**
- 写入 `userData/.ports`，避免每次随机触发 Windows 防火墙弹窗

### 子进程 env 注入（prod）

主进程 spawn 时注入：

| 变量 | 说明 |
|---|---|
| `DEEPSEEK_API_KEY` / `RUNNINGHUB_API_KEY` / `RESEND_API_KEY` / `ARK_API_KEY` | 中央服务下发后注入 |
| `FFMPEG_EXE` / `FFPROBE_EXE` | 绝对路径 |
| `CREDIT_DB_OVERRIDE` | `<userData>/data/accounts.db` |
| `DATA_DIR` | `<userData>/video-cache` |
| `VIDEO_BGM_DIR` | `<resources>/bgm` |
| `VIDEO_POSTPROCESS_DIR` | `<userData>/video-postprocess` |

子进程**不读 `.env` 文件**，避免明文 API Key 落到磁盘。

### 开发流程

```bash
pnpm install                            # 含 electron + electron-builder + electron-log + node-machine-id
pnpm electron:dev                       # dev 期：Electron 窗口 + dev 期的 next + uvicorn
pnpm resources:build                    # 出包前：构建 resources/ 下所有产物
pnpm preflight                          # 出包前：校验资源齐全
pnpm dist:win                           # 出 NSIS 安装包到 release/
```

### Dev 期 vs Prod 期

| 维度 | dev | prod |
|---|---|---|
| Next.js 命令 | `pnpm exec next dev` | `node server.js` |
| Python 命令 | `python -m uvicorn main:app` | `<resources>/python/python.exe -m uvicorn main:app` |
| Python cwd | 项目根 | `<resources>/` |
| Next cwd | 项目根 | `<resources>/next-standalone/` |
| 端口 | 3010 / 8010 | 3010 / 8010 |
| API Key 注入 | 不注入（用 .env.local） | 从中央服务拉 |

判断分支在 `electron/main.ts:bootstrap()`：用 `app.isPackaged` 区分。

### 已知限制（MVP）

- Windows Defender SmartScreen 弹"未知发布者"，需用户点"更多信息 → 仍要运行"
- API Key 通过 `wmic process get CommandLine` 可能泄漏（命令行可见），后续阶段用临时 dotenv 优化
- 单机单用户；不支持账号切换
- 离线激活模式未实现（仅在线）

---

## 关键文档与计划

- [docs/deploy/PAAS.md](docs/deploy/PAAS.md) — PaaS / Docker 部署
- [docs/deploy/ELECTRON-BUILD.md](docs/deploy/ELECTRON-BUILD.md) — Electron 桌面打包
- [docs/deploy/CENTRAL-ACTIVATION.md](docs/deploy/CENTRAL-ACTIVATION.md) — 中央激活服务

## 开发常用命令

```bash
# 安装依赖
pnpm install

# 同时启动 Next + FastAPI
pnpm dev:all

# 只启动 Next
pnpm dev

# 只启动 FastAPI
uvicorn main:app --reload --port 8000

# Python 单元测试
python -m pytest tests/ -v

# TypeScript 单元测试
node --experimental-strip-types --loader ./tests/alias-loader.mjs --test tests/

# 类型检查
npx tsc --noEmit
```

## 已知技术债

- `Microsoft YaHei` 字体在 `build_ass_subtitles` 硬编码，跨平台部署需做字体检测 + fallback
- `_FFMPEG_EXE` / `_FFPROBE_EXE` 优先用 `tools/ffmpeg/bin/`，但仓库内未自带二进制（部署时需补）
- `burn_subtitle_ffmpeg` 的 3 个 dead 分支已删除，但保留 `has_audio_stream` no-op 调用以兼容旧 test mock
- BGM 截断后的临时文件保留在 `output_dir/`，未做清理（避免与 ffmpeg 调试产物混淆）

---

## 图文视频 / 视频混剪 修复（2026-06-27 已实施）

> **状态**：已实施。图文视频与视频混剪改为异步任务 + Next.js 代理 + 前端轮询，修复 `Failed to fetch`。

### 已实施内容

| 项 | 位置 |
|---|---|
| Next 代理 | `app/api/video/image-to-video/`、`app/api/video/mashup/`（POST + status + cancel） |
| 异步管线 | `main.py` — `_image_task_store` / `_mashup_task_store` + `STAGE_IV_*` / `STAGE_MV_*` |
| 前端轮询 | `components/image-video-workflow.tsx`、`components/mashup-video-workflow.tsx` |
| 运行时 | `lib/image-video-task-runtime.ts`、`lib/mashup-video-task-runtime.ts` |
| 加固 | `_pick_first_result_url`、克隆音频 `probe_audio_duration` 校验、产物大小校验 |

### 历史诊断记录（2026-06-25）

> 以下为修复前的诊断，保留供参考。

### 用户报告的现象

视频混剪（mashup）功能生成完成后，前端下载到的是 `mashup_xxx_ac55a4_final.htm` 而非 `.mp4`，文件无法打开（"没有文件"）。图文视频（image-to-video）用户怀疑 ffmpeg 不支持图片在视频轨道播放 N 秒——但实际上 **ffmpeg 完全支持**（`-loop 1 -i image.png`），代码里已经这么写，问题在调用链路上。

### 关键根因（推测，待核实）

1. **`.htm` 文件来源**：`mashup_video_postprocess.py` 渲染函数本身输出 `.mp4`，但 main.py 流程中如果**前置链路**（声音克隆/下载）失败时把错误 HTML 当作音频保存到 `voice_local_path`，后续 ffmpeg 拿到的是 HTML 错误页 → 渲染出空视频或异常；或 response 中 `video_url` 在异常分支被错误指向了某个 `.htm` 路径。
2. **同步阻塞接口**：当前图文视频 (`main.py:1360-1454`) 和视频混剪 (`main.py:1460-1554`) 都是 `async def` 但内部用 `asyncio.to_thread` 同步阻塞 → 浏览器默认超时（10 分钟）会先于流程完成，**用户可能没等到结果就以为失败了**。
3. **ffmpeg 错误不可见**：当前失败时返回 `error: str`，但没有返回 `ffmpeg stderr`；调试只能去看 `lib/image_video_postprocess.py` 写出的 `ffmpeg_burn_cmd.txt` / `ffmpeg_burn_stderr.txt` 调试文件。

### 修复方案（已与用户确认）

| 维度 | 决策 |
|---|---|
| bug 修复 | **图文视频 + 视频混剪 都修**（两个模块剪辑逻辑几乎一样） |
| 接口形态 | **改成异步任务队列**（参考数字人口播的 stage 系统，前端轮询） |
| 架构深度 | **抽取共享工具**（xfade 转场链、字幕时间轴、BGM 选取），不合并为单一 render |

### 关键文件清单

**后端 Python：**

- `main.py:1360-1454` — 图文视频 endpoint（同步，要拆路由 + 改异步）
- `main.py:1460-1554` — 视频混剪 endpoint（同步，要拆路由 + 改异步）
- `main.py:176-220` — STAGE 常量 + `_set_stage` 函数（**复用**，不重写）
- `main.py:504` — `_task_store` 字典（**新建独立字典**：`_image_task_store` / `_mashup_task_store`）
- `lib/image_video_postprocess.py` — 图文视频 ffmpeg 渲染（**已有完整实现**）
- `lib/mashup_video_postprocess.py` — 视频混剪 ffmpeg 渲染（**已有完整实现**）
- `lib/video_postprocess.py` — 通用 ffmpeg 模板（**不直接复用**，因为这两个是不同模式）
- `lib/subtitle_generator.py` — 字幕生成（**复用**）
- `lib/runninghub_client.py` — 声音克隆客户端（**复用**）
- `routes/promo_video_routes.py` — 已存在的路由拆分样例（**可参考结构**）

**前端 TypeScript：**

- `components/image-video-workflow.tsx` — 图文视频前端（要改轮询）
- `components/mashup-video-workflow.tsx` — 视频混剪前端（要改轮询）
- `lib/video-task-store.ts` — localStorage 持久化（**模式复用**，新建图文/混剪专用）
- `lib/video-task-runtime.ts` — 数字人口播运行时（**模式参考**，新建简化的图文/混剪 runtime）
- `lib/video/api.ts:112-126` — 客户端 API 封装（要加轮询函数）

### 拟定的 stage 设计（参考数字人口播模式）

**图文视频 stages**（9 个）：

```python
STAGE_IV_DECODING_IMAGES    = "iv_decoding_images"      # 解码图片素材
STAGE_IV_DECODING_AUDIO     = "iv_decoding_audio"       # 解码音色样本
STAGE_IV_UPLOADING_AUDIO    = "iv_uploading_audio"      # 上传音色到 RunningHub
STAGE_IV_SUBMITTING_CLONE   = "iv_submitting_clone"     # 提交音频克隆
STAGE_IV_WAITING_CLONE      = "iv_waiting_clone"        # 等待克隆（≤10 分钟）
STAGE_IV_DOWNLOADING_CLONE  = "iv_downloading_clone"    # 下载克隆音频
STAGE_IV_RENDERING          = "iv_rendering"            # ffmpeg 渲染
STAGE_IV_COMPLETED          = "iv_completed"
STAGE_IV_FAILED             = "iv_failed"
STAGE_IV_CANCELLED          = "iv_cancelled"
```

**视频混剪 stages**（9 个，前缀 `MV`）：

```python
STAGE_MV_DECODING_VIDEOS    = "mv_decoding_videos"      # 解码视频素材
STAGE_MV_DECODING_AUDIO     = "mv_decoding_audio"
STAGE_MV_UPLOADING_AUDIO    = "mv_uploading_audio"
STAGE_MV_SUBMITTING_CLONE   = "mv_submitting_clone"
STAGE_MV_WAITING_CLONE      = "mv_waiting_clone"
STAGE_MV_DOWNLOADING_CLONE  = "mv_downloading_clone"
STAGE_MV_RENDERING          = "mv_rendering"
STAGE_MV_COMPLETED          = "mv_completed"
STAGE_MV_FAILED             = "mv_failed"
STAGE_MV_CANCELLED          = "mv_cancelled"
```

### 实施步骤建议

1. **修 bug**：先在 main.py 现有同步流程里捕获 ffmpeg stderr + 前置链路（克隆/下载）的异常，把 `.htm` 文件来源查清楚——是 `audio_clone_url` 异常、还是 response fallback 写错文件。
2. **抽路由**：把图文视频 endpoint 拆到 `routes/image_video_routes.py`、视频混剪拆到 `routes/mashup_video_routes.py`（参考 `routes/promo_video_routes.py` 结构）。
3. **改异步**：每个模块加 `_run_xxx_pipeline` 后台 worker + `_set_stage` 阶段写入 + `_task_store` / `_poll_tasks` 独立字典。
4. **抽共享**：把 `image_video_postprocess` 和 `mashup_video_postprocess` 里的 xfade 链构建、字幕时间轴分配、BGM 选取逻辑提到 `lib/video_clip_common.py`。
5. **前端轮询**：图文视频 / 视频混剪前端改为提交后立即 `setInterval` 轮询 status endpoint，进度条按 stage 推进。
6. **加 cancel**：每个模块加 `/cancel` endpoint（参考 `main.py:980-1003`），在 WAITING_CLONE 阶段可中断。

### 验收方式

- 后端：`POST /api/video/image-to-video` 与 `POST /api/video/mashup` 应在 30ms 内返回 `{task_id, status:"queued"}`
- 后端：`GET /api/video/image-to-video/status?taskId=xxx` 返回完整 stage 链 + 进度
- 前端：视频生成完成前不超时（即使 10 分钟也正常），Stage 进度条按顺序推进
- 端到端：上传 7+ 张图片 + 音色 + 文案 → 3 步流程无错误，最终下载到真实 `.mp4`（非 `.htm`）
- 取消：在 WAITING_CLONE 阶段点"停止"应能中断，不会扣错积分

### 关联探索记录（2026-06-25）

本次会话已完成 4 个并行的 Explore agent 深度探索，覆盖：

1. 图文视频模块诊断（前端组件 + 后端 endpoint + ffmpeg 渲染）
2. 视频混剪模块诊断（前端 + 后端 + 渲染函数）
3. ffmpeg 通用模板与图文视频专用模块对比
4. 数字人口播异步管线骨架（作为改造参考模板）

关键发现：

- `image_video_postprocess.py` 是 335 行**全量实现**（非 stub），main.py:1418 正确调用
- `mashup_video_postprocess.py` 是 364 行**全量实现**，main.py 调用流程几乎一致
- 两个 ffmpeg 渲染器**80% 逻辑重复**（xfade 转场、字幕、BGM 混音）
- 数字人口播异步模式**完整且稳定**，可直接作为改造模板
- `routes/promo_video_routes.py` **已存在但未注册到 main.py**，是路由拆分的现成样例

> 接手者请直接看 `main.py:722-1046`（数字人口播异步管线完整实现）作为改造模板，无需重读 RunningHub / 字幕 / ffmpeg 模块。
