# Electron Windows 本地构建与手动分发

GitHub 仓库提供**可构建源码**，不是解压即用的安装包。终端用户需要的是 `release/*.exe`（NSIS 安装程序），须在 Windows 构建机上本地产出后**人工分发**（U 盘、网盘、内网共享等）。当前未配置 GitHub Release 自动上传。

## 前置条件

| 项 | 说明 |
|----|------|
| OS | Windows 10/11 x64 |
| **项目路径** | **建议使用纯 ASCII 路径**（如 `C:\build\zhongtai-main`）。含中文的路径可能导致 `electron-builder` 在扫描 `node_modules` 时出现 `ENOENT` 编码错误 |
| Node.js | 22.x |
| pnpm | 9.x（`corepack enable`） |
| 网络 | 首次 `resources:build` 需下载 embeddable Python 3.13 |
| ffmpeg | [`tools/ffmpeg/bin/ffmpeg.exe`](../../tools/ffmpeg/bin/ffmpeg.exe) 已存在 |
| NSIS 资源 | [`build/icon.ico`](../../build/icon.ico) 等已纳入 Git |
| 中央激活服务 | 公网 HTTPS 已部署，见 [CENTRAL-ACTIVATION.md](./CENTRAL-ACTIVATION.md) |
| 激活码 | 至少 1 个有效码（`scripts/create-activation-codes.py`） |

## 构建环境变量

复制 [`.env.electron-build.example`](../../.env.electron-build.example) 为本地文件并填入：

- `CENTRAL_SERVICE_URL` — 中央服务 HTTPS 地址
- `CENTRAL_SIGNING_PUBLIC_KEY` — 与中央服务器配对的 Ed25519 公钥 PEM

开发期 `.env` 中的 AI Key **不会**打进安装包；生产 Key 由中央激活下发。

## 完整构建命令链

在项目根目录：

```powershell
pnpm install
pnpm electron:build
pnpm resources:build    # 含 pnpm build + Python bundle，约 10–20 分钟
pnpm preflight          # 必须通过（含 routes/ 与 main import smoke）
pnpm dist:win           # 产出 release/AI营销获客中台-Setup-*.exe
```

产物路径示例：`release/AI营销获客中台-Setup-0.1.0.exe`

## 中央服务依赖

安装包内**不含** API Key。用户首次启动：

1. 向导要求输入激活码
2. 客户端请求 `CENTRAL_SERVICE_URL/api/central/activate`
3. 验签通过后 Key 注入子进程环境

若中央服务未部署或域名未写入构建 env，激活步骤会失败。

## 手动分发步骤

1. 在构建机完成上述命令链，确认 `release/*.exe` 存在并记录文件大小。
2. 将 `.exe` 发给用户（勿提交到 Git）。
3. 附带：激活码、中央服务可用性说明、SmartScreen 提示（见下）。
4. 可选：提供 [`CENTRAL-ACTIVATION.md`](./CENTRAL-ACTIVATION.md) 中运维联系人。

## 安装后手动 QA 清单（无干净 VM 时）

在**未安装 Node/Python** 的目标 Windows 机器上：

- [ ] 双击 Setup，完成安装（若 SmartScreen 拦截，点「更多信息」→「仍要运行」）
- [ ] 首次启动出现激活向导，输入有效激活码成功
- [ ] 主界面加载（默认 `http://127.0.0.1:3010` 由 Electron 内嵌）
- [ ] 邮箱登录 / 注册流程正常
- [ ] 数字人口播：提交任务，stage 进度推进，最终可下载 `.mp4`
- [ ] 托盘：关闭窗口最小化到托盘，右键可退出
- [ ] 日志：`%APPDATA%/AI营销获客中台/logs/` 可打开

## 已知限制

- **SmartScreen「未知发布者」**：未代码签名时 Windows 会警告；需 EV 代码签名证书才能消除。
- **端口固定**：Next 3010、FastAPI 8010；占用时需释放后重试。
- **API Key 可见性**：进程命令行可能暴露 Key（MVP 已知限制）。
- **无自动更新**：`electron-updater` 未接 GitHub Release；新版本需重新分发 `.exe`。

## 故障排查

| 症状 | 检查 |
|------|------|
| preflight 缺 `routes/` | 重新 `pnpm resources:build` |
| 安装后 API 503 | prod 是否注入 `FASTAPI_URL`（见 `electron/main.ts`） |
| FastAPI ImportError | `resources/routes/` 与 `PYTHONPATH` |
| 激活验签失败 | 构建公钥与中央私钥是否配对 |
| dist:win 缺 icon | `build/icon.ico` 是否在 Git 中 |
| dist:win `ENOENT` 路径乱码 | 将仓库移到 ASCII 路径，如 `C:\build\zhongtai-main` |
| dist:win 下载 `winCodeSign` 超时 | 已在 `electron-builder.yml` 设置 `signAndEditExecutable: false`；或设 `$env:CSC_IDENTITY_AUTO_DISCOVERY="false"` |

## 相关文档

- 打包设计：[docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md](../superpowers/specs/2026-06-24-electron-desktop-packaging-design.md)
- 中央激活：[CENTRAL-ACTIVATION.md](./CENTRAL-ACTIVATION.md)
- 项目速查：[CLAUDE.md](../../CLAUDE.md)
