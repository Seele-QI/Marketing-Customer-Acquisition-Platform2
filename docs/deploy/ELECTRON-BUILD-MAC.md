# Electron macOS 通用安装包（GitHub Actions / 无签名）

与 Windows NSIS 对等的全套桌面包：内嵌 Next standalone + Darwin Python（arm64 + x64）+ ffmpeg + 激活/更新。在本机 **Windows 上不能** 交叉产出合法 Mac 安装包；请用 GitHub Actions `macos-14` runner。

## 产物

| 文件 | 说明 |
|------|------|
| `release/招财猫-<version>-mac.dmg` | universal（arm64 + x64）未签名 DMG |
| `release/latest-mac.yml` | electron-updater Mac 清单 |

安装包内按 `process.arch` 选择：

- `Resources/runtime/darwin-arm64/{python,ffmpeg}`
- `Resources/runtime/darwin-x64/{python,ffmpeg}`

## 前置：仓库 Secrets

| Secret | 必需 | 用途 |
|--------|------|------|
| `DESKTOP_PACKAGED_ENV` | ✅ | 完整项目根 `.env` 文本（含 `EMAIL_HASH_SALT`、`CLOUD_API_URL` 等；`resources:build` → `copy-packaged-env` 依赖） |
| `CLOUD_API_URL` | 可选 | 若未写入 `DESKTOP_PACKAGED_ENV` 时补全 |
| `UPDATE_FEED_URL` | 可选 | Mac/Win 共用 OSS releases 前缀 |
| `OSS_REGION` / `OSS_BUCKET` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 上传时 | `upload_oss=true` |
| `OSS_PREFIX` | 可选 | 默认 `releases` |

## 触发构建

1. GitHub → Actions → **Desktop Mac Universal** → Run workflow  
2. 可选勾选 **Upload DMG + latest-mac.yml to Aliyun OSS**  
3. 或推送 tag：`desktop-mac-v0.1.0`

产物在 workflow Artifact：`mac-universal-dmg`。

本地（仅限 macOS 机器）：

```bash
pnpm install
pnpm icons:build
pnpm resources:build    # 双架构 Python + ffmpeg + next-standalone
pnpm preflight
pnpm dist:mac           # unsigned universal DMG
# 可选
pnpm release:upload-oss
```

`resources:build` 在 Darwin 会为 x86_64 Python 跑 Rosetta；CI 已执行 `softwareupdate --install-rosetta`。

## Gatekeeper（未签名）

首次打开若提示「无法验证开发者」：

1. **右键** DMG / App → **打开** → 仍要打开  
2. 或终端：`xattr -cr "/Applications/招财猫.app"`

本阶段不做 Developer ID 签名与公证。

## QA 清单

在干净 Mac（无系统 Node/Python 依赖）上：

- [ ] 安装 DMG，拖到 Applications  
- [ ] 绕过 Gatekeeper 后能启动  
- [ ] 激活 / 登录流程正常  
- [ ] 主界面 `http://127.0.0.1:3010` 加载；FastAPI `:8010/health` 正常  
- [ ] 依赖 ffmpeg 的链路至少一条可跑（如封面/剪辑）  
- [ ] Apple Silicon 与 Intel（或 Rosetta）均可启动  

## 相关

- Windows 出包：[ELECTRON-BUILD.md](./ELECTRON-BUILD.md)  
- OSS 更新：[DESKTOP-UPDATE-OSS.md](./DESKTOP-UPDATE-OSS.md)  
- 配置入口：[`.github/workflows/desktop-mac.yml`](../../.github/workflows/desktop-mac.yml)
