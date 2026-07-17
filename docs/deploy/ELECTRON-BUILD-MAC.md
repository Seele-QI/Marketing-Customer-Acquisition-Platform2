# Electron macOS 安装包（GitHub Actions / 无签名）

与 Windows NSIS 对等的全套桌面包：内嵌 Next standalone + Darwin Python + ffmpeg。
在 Windows 上不能交叉产出 `.dmg`；请用 GitHub Actions `macos-14` runner。

> **说明**：因 Next standalone 含 esbuild/sharp 等单架构原生依赖，`electron-universal` lipo 会失败。
> 因此产出 **两个 DMG**（`arm64` + `x64`），而不是单个 universal 包。Apple Silicon 下 x64 包也可经 Rosetta 运行。

## 产物

| 文件 | 说明 |
|------|------|
| `release/招财猫-<version>-mac-arm64.dmg` | Apple Silicon |
| `release/招财猫-<version>-mac-x64.dmg` | Intel（也可在 Apple Silicon + Rosetta） |
| `release/latest-mac.yml` | electron-updater Mac 清单 |

安装包内按 Electron 架构保留对应运行时：

- arm64 包 -> `Resources/runtime/darwin-arm64/{python,ffmpeg}`
- x64 包 -> `Resources/runtime/darwin-x64/{python,ffmpeg}`

## 前置：仓库 Secrets

| Secret | 必需 | 用途 |
|--------|------|------|
| `DESKTOP_PACKAGED_ENV` | 必填 | 完整项目根 `.env` 文本 |
| `CLOUD_API_URL` | 可选 | 补全云端 API |
| `UPDATE_FEED_URL` | 可选 | OSS releases 前缀 |
| `OSS_*` | 上传时 | `upload_oss=true` |

## 触发构建

1. GitHub -> Actions -> **Desktop Mac Universal** -> Run workflow
2. 或：`gh workflow run "Desktop Mac Universal" --ref <branch>`

产物 Artifact：`mac-dmg`。

本地（仅限 macOS）：

```bash
pnpm install
pnpm icons:build
pnpm resources:build
pnpm preflight
pnpm dist:mac
```

## Gatekeeper（未签名）

1. **右键** DMG / App -> **打开**
2. 或：`xattr -cr "/Applications/招财猫.app"`

## QA 清单

- [ ] 安装对应芯片的 DMG
- [ ] 绕过 Gatekeeper 后能启动
- [ ] 登录 / 主界面 / `:8010/health` 正常
- [ ] 至少一条依赖 ffmpeg 的链路可跑

## 相关

- Windows：[ELECTRON-BUILD.md](./ELECTRON-BUILD.md)
- OSS：[DESKTOP-UPDATE-OSS.md](./DESKTOP-UPDATE-OSS.md)
- Workflow：[`.github/workflows/desktop-mac.yml`](../../.github/workflows/desktop-mac.yml)
