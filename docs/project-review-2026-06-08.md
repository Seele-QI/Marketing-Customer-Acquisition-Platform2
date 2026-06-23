# 项目审计报告（2026-06-08）

## 架构结论

- 主体：Next.js 16 App Router + React 19 + TypeScript 的单页工作台，核心入口为 [page.tsx](file:///f:/A-项目/13-中台网站/app/page.tsx)。
- 文案/团队聊天：前端走 Next API `/api/ai/chat-stream` 转发 DeepSeek/方舟，核心在 [chat-stream route](file:///f:/A-项目/13-中台网站/app/api/ai/chat-stream/route.ts)。
- 可选后端：FastAPI（`main.py`）提供视频生成、账号绑定、一键分发分享等接口。

## 本次已完成修复（与任务相关）

### 团队智能体统一

- 新增统一的团队智能体注册表：[team-agents.ts](file:///f:/A-项目/13-中台网站/lib/team-agents.ts)。
- 首页与智能体中心共用同一份团队智能体数据：
  - [dashboard-view.tsx](file:///f:/A-项目/13-中台网站/components/dashboard-view.tsx)
  - [agent-center.tsx](file:///f:/A-项目/13-中台网站/components/agent-center.tsx)
- 团队聊天加入“智能体选择”并接入共享快捷提问：
  - [chat-workspace.tsx](file:///f:/A-项目/13-中台网站/components/chat-workspace.tsx)
  - [page.tsx](file:///f:/A-项目/13-中台网站/app/page.tsx)

### 一键分发可用性

- 前端 FastAPI 地址不再硬编码 `127.0.0.1:8000`，改为统一读取 `NEXT_PUBLIC_FASTAPI_URL`：
  - [fastapi-base.ts](file:///f:/A-项目/13-中台网站/lib/fastapi-base.ts)
  - [share-distribute.tsx](file:///f:/A-项目/13-中台网站/components/share-distribute.tsx)
- FastAPI 分享链接生成逻辑改为优先使用 `SHARE_BASE_URL`，本地开发则可用 `Request.base_url` 推导：[main.py](file:///f:/A-项目/13-中台网站/main.py#L570-L607)。
- 修正“跨域 localStorage 注入自动填充”的不可行设计：扫码打开链接进入落地页，提供“复制文案 / 打开抖音创作者中心”两步完成分发：[main.py](file:///f:/A-项目/13-中台网站/main.py#L619-L742)。

### 资源与稳定性

- 修复 `image-base64` 的图片解码等待顺序错误（避免 Promise 卡死）：[image-base64.ts](file:///f:/A-项目/13-中台网站/lib/image-base64.ts#L77-L101)。
- 统一处理多个模块中 `URL.createObjectURL` 的回收，降低内存泄漏风险：
  - [share-distribute.tsx](file:///f:/A-项目/13-中台网站/components/share-distribute.tsx#L33-L43)
  - [batch-edit.tsx](file:///f:/A-项目/13-中台网站/components/batch-edit.tsx#L54-L101)
  - [video-creation-workflow.tsx](file:///f:/A-项目/13-中台网站/components/video-creation-workflow.tsx#L243-L255)

## 安全审计结论（重点）

### 已加固项

- CORS 配置避免 `allow_origins=["*"]` 与 `allow_credentials=True` 同时出现，并对 `CORS_ALLOW_ORIGINS="*"` 误配做保护：[main.py](file:///f:/A-项目/13-中台网站/main.py#L21-L44)。
- 分享接口（生产环境）增加鉴权：`SHARE_API_TOKEN` + `X-Share-Token`；并在生产强制要求 `SHARE_BASE_URL`：[main.py](file:///f:/A-项目/13-中台网站/main.py#L580-L616)。
- 分享落地页增加安全头（CSP / X-Frame-Options / nosniff / no-referrer / no-store）：[main.py](file:///f:/A-项目/13-中台网站/main.py#L712-L742)。
- 分享 token 随机化（≥128-bit），增加 TTL 清理与容量上限、并限制 token 访问格式：[main.py](file:///f:/A-项目/13-中台网站/main.py#L499-L520)。

### 未修复但需要关注的高风险项

- Cookie 加密相关（账号绑定）：
  - 若存在“固定回退密钥”，等同于可被还原的伪加密风险。
  - 目前使用 AES-CBC（无认证），存在被篡改而不自知的风险，建议改为 AEAD（如 AES-GCM）或 CBC + HMAC（Encrypt-then-MAC）。
  - 相关实现见 [crypto_utils.py](file:///f:/A-项目/13-中台网站/lib/crypto_utils.py)。
- FastAPI 中部分 async 接口使用同步 sqlite3 I/O，可能阻塞事件循环并在并发下劣化，建议线程池/异步 DB 方案（后续可作为性能专项处理）。
- Next.js 构建配置 `ignoreBuildErrors: true` 会掩盖类型错误，生产风险偏高：[next.config.mjs](file:///f:/A-项目/13-中台网站/next.config.mjs#L1-L8)。

## 推荐的环境变量（本地/生产）

- 前端：
  - `NEXT_PUBLIC_FASTAPI_URL`：FastAPI 基址（本地可不填，生产建议必填）
- FastAPI：
  - `SHARE_BASE_URL`：分享链接外部可访问基址（生产必填）
  - `SHARE_API_TOKEN`：分享生成接口鉴权 token（生产必填，请求头 `X-Share-Token`）
  - `CORS_ALLOW_ORIGINS`：生产建议显式域名列表（逗号分隔）

## 验证状态（对应验收标准）

- 静态检查：已通过 `pnpm.cmd exec tsc --noEmit`。
- FastAPI 语法：已通过 `python -m py_compile main.py`。
- 运行态联调验证：在下一步“任务7：启动并执行完整验证”中完成（包含一键分发全链路与团队智能体切换）。
