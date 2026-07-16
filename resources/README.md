# resources/

Electron 桌面打包运行时资源。**本目录不进 git**，由 `scripts/build-*.mjs` 在出包前自动产出。

## 子目录

| 目录 | 内容 | 来源脚本 |
|---|---|---|
| `python/` | Windows：embeddable Python 3.13 + site-packages + `lib/` | `scripts/build-python-bundle.mjs` |
| `runtime/darwin-arm64/` / `runtime/darwin-x64/` | Mac：standalone Python（`applib/`）+ ffmpeg/ffprobe | `build-python-bundle` + `extract-ffmpeg` |
| `ffmpeg/bin/` | Windows：`ffmpeg.exe` + `ffprobe.exe` | `scripts/extract-ffmpeg.mjs` |
| `next-standalone/` | Next.js standalone | `scripts/build-next-standalone.mjs` |
| `bgm/` | mp3 BGM | `scripts/build-next-standalone.mjs` |
| `main.py` | FastAPI 入口 | `scripts/build-next-standalone.mjs` |

## 出包流程

```bash
pnpm resources:build        # 跑所有 build-* 脚本
pnpm preflight              # 校验资源齐全
pnpm dist:win               # Windows NSIS
pnpm dist:mac               # macOS universal DMG（需 Darwin / GHA）
```

详见 [docs/deploy/ELECTRON-BUILD-MAC.md](../docs/deploy/ELECTRON-BUILD-MAC.md)。

## 何时重新构建

| 改动 | 需要重新构建 |
|---|---|
| 修改 `main.py` / `lib/*` | `pnpm resources:build` |
| 修改 `requirements.txt` | `pnpm resources:build` |
| 修改 `assets/bgm/*` | `pnpm resources:build` |
| 修改 `tools/ffmpeg/ffmpeg.zip` | `node scripts/extract-ffmpeg.mjs`（Windows） |
| 修改 Next.js 代码 | `pnpm resources:build` |
| 修改 Electron 代码 | `pnpm electron:build` |

## dev 期

dev 模式下**不读 resources/**，而是直接用项目根的 next dev + python -m uvicorn。
详见 `electron/main.ts` 的 `isDev` 分支。
