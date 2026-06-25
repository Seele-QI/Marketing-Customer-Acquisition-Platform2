# Electron 桌面打包设计

> 日期：2026-06-24
> 状态：已批准（参见 `~/.claude/plans/prancy-hatching-torvalds.md`）

## 背景

项目当前是 Next.js 16 + FastAPI 双服务 Web 应用，依赖 ffmpeg/yt-dlp/Resend/RunningHub 等外部服务。
客户希望以"桌面软件"形态使用：双击图标即用，无需启动两个服务 + 浏览器。需支持：

1. **小白友好**：双击安装、双击图标运行、关窗不退出、崩溃自动恢复、一键导出日志。
2. **可商业化**：激活码管控、API Key 由中央服务器下发（防反编译）。
3. **可演进**：客户端可在线升级。

## 目标

- 出 Windows NSIS 安装包（~150 MB）。
- 客户流程：双击安装 → 自动启动向导 → 输入激活码 → 进入主界面 → 日常双击图标使用。
- 升级流程：推 GitHub Release → 客户端自动检测 → 用户点确认 → 下载 → 重启安装。

## 非目标（MVP 不做）

- macOS / Linux 打包。
- 代码签名（接受 SmartScreen 警告）。
- 中央服务的 Web 管理后台 UI（先用 curl / Postman）。
- 离线激活模式。
- 沙箱 / 多用户切换。
- SQLCipher 加密。

## 总体架构

```
┌──────────────────────────────────────────────────────────────────┐
│              Windows 客户端 (Electron 33 + Node 20)                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  主进程 (TypeScript)                                        │   │
│  │  - 首次启动检测：弹激活向导 → 调中央服务激活 → 缓存凭证     │   │
│  │  - 子进程管理：spawn + 守护 + 崩溃恢复                     │   │
│  │  - 托盘 / 单实例 / 自启动 / 关窗拦截                        │   │
│  │  - electron-updater 差分更新                                │   │
│  │  - electron-log 主日志 + 一键导出 zip                       │   │
│  └──────────────────────────────────────────────────────────┘   │
│       spawn (port 3010)            spawn (port 8010)              │
│              ↓                              ↓                     │
│  ┌──────────────────────┐      ┌──────────────────────────┐      │
│  │ Next.js 16 standalone │      │ FastAPI (uvicorn)         │      │
│  │ node server.js         │      │ python -m uvicorn main:app │      │
│  └──────────────────────┘      └──────────────────────────┘      │
│                                                                    │
│  resources/ (electron-builder extraResources)                      │
│   ├─ python/        embeddable Python 3.13 + site-packages         │
│   ├─ ffmpeg/bin/    ffmpeg.exe + ffprobe.exe                       │
│   ├─ next-standalone/   .next/standalone/                          │
│   ├─ bgm/           copy 自 assets/bgm/                            │
│   └─ main.py        copy 自项目根 main.py                           │
└──────────────────────────────────────────────────────────────────┘
                                │ HTTPS
                                ▼
┌──────────────────────────────────────────────────────────────────┐
│              中央服务（复用 main.py，加 5 个路由）                   │
│  POST /api/central/activate        激活码激活 + 密钥下发            │
│  GET  /api/central/manifest         版本检查 + 强制升级             │
│  POST /api/central/heartbeat        心跳 + 注销检测                 │
│  GET  /api/central/admin/codes     管理后台列码（需 admin key）     │
│  POST /api/central/admin/codes     创建激活码                       │
└──────────────────────────────────────────────────────────────────┘
```

## 关键技术决策

| 维度 | 选择 | 理由 |
|---|---|---|
| Electron | 33.x | 内置 Node 20.x，对齐 Next 16 standalone 要求 |
| 打包器 | electron-builder | NSIS + extraResources + electron-updater 同生态 |
| 进程管理 | 自己 spawn | 需精细控制 stdio / env / 健康检查 |
| Python | python.org embeddable 3.13 + `pip install --target` | ~10 MB 免安装 |
| IPC | contextBridge + ipcMain.handle | 渲染进程零 node 集成 |
| 自动更新 | electron-updater | 差分更新 + GitHub Releases |
| 自启动 | `app.setLoginItemSettings` | Windows 原生 API |
| 托盘 | 内置 Tray + Menu | 跨桌面框架徒增包体积 |
| 日志 | electron-log | 主进程 + 渲染进程同步 |
| 机器指纹 | node-machine-id | 跨平台主板序列号 hash |

### 端口策略

- Next.js: **3010**（避开 3000 冲突）
- uvicorn: **8010**（避开 8000 冲突）
- 端口写入 `userData/.ports`，避免每次随机触发 Windows 防火墙弹窗。

### 子进程 env 注入

主进程 spawn 时注入（**子进程不读 `.env` 文件**，避免明文落盘）：

- `DEEPSEEK_API_KEY` / `RUNNINGHUB_API_KEY` / `RESEND_API_KEY` / `ARK_API_KEY` / `ALIYUN_*`（中央服务拉取后解密注入）
- `FFMPEG_EXE` / `FFPROBE_EXE`（绝对路径）
- `CREDIT_DB_OVERRIDE=<userData>/data/accounts.db`
- `DATA_DIR=<userData>/video-cache`
- `VIDEO_BGM_DIR=<resources>/bgm`
- `VIDEO_POSTPROCESS_DIR=<userData>/video-postprocess`
- `PORT=8010`

### ffmpeg 路径修正（关键）

`lib/video_postprocess.py:66-69` 的 `_FFMPEG_EXE` / `_FFPROBE_EXE` 是**模块级 import 时一次性求值**的常量：

```python
_FFMPEG_EXE = str(_LOCAL_FFMPEG_BIN / "ffmpeg.exe") if (_LOCAL_FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"
```

**单纯修改 PATH 不会生效**。需在文件顶部加 env 优先读取：

```python
_FFMPEG_EXE = os.environ.get("FFMPEG_EXE") or (
    str(_LOCAL_FFMPEG_BIN / "ffmpeg.exe") if (_LOCAL_FFMPEG_BIN / "ffmpeg.exe").exists() else "ffmpeg"
)
_FFPROBE_EXE = os.environ.get("FFPROBE_EXE") or (
    str(_LOCAL_FFMPEG_BIN / "ffprobe.exe") if (_LOCAL_FFMPEG_BIN / "ffprobe.exe").exists() else "ffprobe"
)
```

Electron 端 `env-injector.ts` 注入绝对路径即可。

## 中央激活服务设计

详见 `2026-06-24-central-activation-design.md`。要点：

- 复用 `main.py:_require_admin_key()`（line 72-96）做 admin 鉴权。
- 复用 `_ACCOUNTS_DB` 路径（line 1997）做表存储；启用 WAL。
- 单独建表 `central_activation_codes` / `central_activations`，不复用业务表。
- 密钥池走 env `CENTRAL_KEY_POOL_JSON`，按 `plan` 取组下发。
- 生成算法：`secrets.choice(ALPHABET)` × 12 段，3 段 1 组，格式 `ZT-XXXX-XXXX-XXXX`。

## 凭证加密

`userData/credentials.bin` 格式：

```
[12B iv][16B gcm-tag][N B ciphertext(json)]
```

明文 JSON：

```json
{
  "machine_id": "abcd1234...",
  "activation_code": "ZT-XXXX-XXXX-XXXX",
  "expires_at": 1798761600,
  "keys": {
    "DEEPSEEK_API_KEY": "sk-...",
    "RUNNINGHUB_API_KEY": "...",
    "ARK_API_KEY": "...",
    "RESEND_API_KEY": "..."
  }
}
```

加密：HKDF(machine_id) 派生 key → AES-256-GCM（每条不同 iv）。
篡改 / 换机器：AES GCM tag 校验失败 → 视作首次启动 → 弹向导。

## 目录结构

```
zhongtai-main/
├── electron/                       # Electron 主进程源码
│   ├── main.ts, preload.ts, tsconfig.json
│   ├── windows/                    # 主/向导/日志窗口
│   ├── services/                   # 子进程、激活、托盘、更新、凭证…
│   ├── ipc/                        # IPC 通道常量 + 类型
│   └── utils/                      # paths / process-tree / crypto / port-finder
├── resources/                      # 运行时资源（git 忽略，scripts 产出）
│   ├── python/  ffmpeg/bin/  next-standalone/  bgm/  main.py
├── scripts/
│   ├── build-python-bundle.mjs     # 下载 embeddable + pip install --target + 拷 lib/
│   ├── build-next-standalone.mjs   # pnpm build 后 copy .next/standalone
│   ├── extract-ffmpeg.mjs          # 解 tools/ffmpeg/ffmpeg.zip
│   ├── preflight.mjs               # 出包前检查
│   └── dev-electron.mjs            # dev 期起 next dev + electron，连真 FastAPI
├── build/                          # NSIS 资源（icon.ico, installer.nsh）
├── electron-builder.yml            # 打包配置
├── app/(desktop)/                  # 桌面专属页面（向导、日志查看器）
└── docs/superpowers/{specs,plans}/ # 本文档所在
```

## 风险与缓解

| # | 风险 | 缓解 |
|---|---|---|
| 1 | pydantic 版本不明确 | 实测后锁 `pydantic>=2,<3`（已验证：2.13.3 ✅） |
| 2 | ffmpeg 缺失 | `extract-ffmpeg.mjs` 自动解 `tools/ffmpeg/ffmpeg.zip`；`preflight.mjs` 校验；**且**改 `lib/video_postprocess.py:66-69` 加 env 优先读取 |
| 3 | Remotion 与 Next standalone 冲突 | `next.config.mjs` 已有 `serverExternalPackages`；实测 `.next/standalone` = **89 MB**，无需 `outputFileTracingExcludes` |
| 4 | Windows Defender SmartScreen | MVP 不签名；托盘气泡 + 安装包 README 提示 |
| 5 | SQLite 锁文件 | 启用 WAL + busy_timeout=5000 |
| 6 | 单实例冲突 | `app.requestSingleInstanceLock()` |
| 7 | 子进程僵尸 | 10s 健康检查 + 连续 5 次崩溃弹气泡 |
| 8 | API Key 在进程命令行泄漏 | MVP 接受；后续 dotenv 临时文件方案 |

## Quick Check 结果（阶段 0）

| # | 检查 | 结果 |
|---|---|---|
| 1 | pydantic 版本 | 2.13.3（v2），符合预期 |
| 2 | `.next/standalone` 体积 | 89 MB，无需 trace 优化 |
| 3 | node-machine-id 可用性 | 返回 SHA256 哈希，正常 |
| 附 | `/auth/verify` build 错误 | 已修（Suspense 包装），不在原计划范围 |

## 工期

约 17 个工作日，详见实施计划 `2026-06-24-electron-desktop-packaging-implementation.md`。