# resources/

Electron 桌面打包运行时资源。**本目录不进 git**，由 `scripts/build-*.mjs` 在出包前自动产出。

## 子目录

| 目录 | 内容 | 来源脚本 | 大小 |
|---|---|---|---|
| `python/` | embeddable Python 3.13 + site-packages (10 个依赖) + `lib/` | `scripts/build-python-bundle.mjs` | ~50 MB |
| `ffmpeg/bin/` | `ffmpeg.exe` + `ffprobe.exe` | `scripts/extract-ffmpeg.mjs`（从 `tools/ffmpeg/ffmpeg.zip` 解出） | ~150 MB |
| `next-standalone/` | Next.js 16 standalone build（`server.js` + `.next/static` + `public/`） | `scripts/build-next-standalone.mjs` | ~89 MB |
| `bgm/` | 16 个 mp3 + 1 个 boss_voice.mp3 | `scripts/build-next-standalone.mjs`（从 `assets/bgm/` copy） | ~5 MB |
| `main.py` | FastAPI 入口 | `scripts/build-next-standalone.mjs`（从项目根 copy） | ~80 KB |

## 出包流程

```bash
pnpm resources:build        # 跑所有 build-* 脚本
pnpm preflight              # 校验资源齐全
pnpm dist:win               # 出 NSIS 安装包
```

## 何时重新构建

| 改动 | 需要重新构建 |
|---|---|
| 修改 `main.py` / `lib/*` | `pnpm resources:build`（rebuild python bundle + next-standalone + main.py） |
| 修改 `requirements.txt` | `pnpm resources:build` |
| 修改 `assets/bgm/*` | `pnpm resources:build`（会重新 copy bgm） |
| 修改 `tools/ffmpeg/ffmpeg.zip` | `node scripts/extract-ffmpeg.mjs`（单独） |
| 修改 Next.js 代码 | `pnpm resources:build`（触发 `pnpm build`） |
| 修改 Electron 代码 | `pnpm electron:build`（tsc 编译） |

## dev 期

dev 模式下**不读 resources/**，而是直接用项目根的 next dev + python -m uvicorn。
详见 `electron/main.ts` 的 `isDev` 分支。