# 开发机云端模型环境注入设计

## 目标

直接运行 `pnpm dev:all` 时，让 Next.js 与 FastAPI 读取桌面客户端已经同步到本机的云端模型渠道快照，行为与 Electron 启动链保持一致。

## 边界

- 仅注入纯模型 API 渠道：大语言模型 `openai_chat`、`ark_chat`，视频模型 `seedance_video`、`xinghe_video`。
- 不注入 RunningHub 工作流配置。
- 不注入图片生成专用配置，图片生成继续读取项目内置的 `ARK_IMAGE_*` 环境变量。
- 不修改现有模型路由、模型选择和故障转移逻辑；统一通过既有 `MODEL_PROVIDERS_JSON_B64` 契约下发。

## 方案

新增一个不依赖 Electron 运行时的 Node 模块，读取 Electron userData 中的 `credentials.bin`，使用相同 machine-id 与 AES-256-GCM/HKDF 契约解密，校验并筛选允许的 provider，生成 `MODEL_PROVIDERS_JSON_B64`。

新增统一开发启动器：启动前加载一次云端快照，再把同一份环境变量传给 `next dev` 与 `scripts/dev-api.mjs`。`package.json` 的 `dev:all` 改为调用该启动器。单独运行 `dev:web` 或 `dev:api` 保持原行为。

## 失败行为

若缓存不存在、解密失败或没有可用的纯模型 API 渠道，启动器输出明确错误并退出，避免开发环境静默使用本地固定模型或在页面提交后才返回模糊错误。

## 验证

- 单元测试验证缓存解密、provider 筛选及 RunningHub/图片配置隔离。
- 单元测试验证缺失缓存时的明确错误。
- 静态接线测试验证 `dev:all` 使用统一启动器，且两个子进程共享注入环境。
- 运行 TypeScript 类型检查，保证未破坏现有调用链。
