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
├── docs/superpowers/       # 设计文档与实施计划
├── .env / .env.local       # 运行时配置（git 忽略）
├── .env.example            # 配置模板（git 跟踪）
└── CLAUDE.md               # 本文件
```

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
| `NEXT_PUBLIC_FASTAPI_URL` | `lib/fastapi-base.ts` | ✅ | Next → FastAPI 反向地址 |
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
| `ARK_API_KEY` | `app/api/ai/ark-images/route.ts` | 可选 | 火山方舟 - 识图/多模态 |
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

**容器内环境变量**：`NEXT_PUBLIC_FASTAPI_URL=http://api:8000`（web → api 内网 DNS），`DATA_DIR=/data` + `CREDIT_DB_OVERRIDE=/data/accounts.db` + `VIDEO_BGM_DIR=/app/assets/bgm`（api Volume 持久化）。

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

## 视频生成架构（2026-06-25 重构）

### 异步管线（P1）

`POST /api/video/generate` **30ms 内返回**，不再同步等待音频克隆（10 min）。全流程在后台 asyncio 中执行：

```text
POST /api/video/generate → 200 { task_id:"vg_xxx", status:"queued" }
                              ↓
后台 _run_video_pipeline(task_id):
  1. decoding_base64 → 2. uploading_image → 3. uploading_audio
  → 4. submitting_audio_clone → 5. waiting_audio_clone (≤10 min)
  → 6. submitting_video → 7. 衔接 _poll_video_task
                              ↓
后台 _poll_video_task(task_id, rh_task_id):
  轮询 RunningHub (≤50 min) → 完成 → _run_post_process → _run_cover_generation
```

关键设计：

- `task_id` 是本地生成的 `vg_{ts}_{rand}`，RunningHub 的 taskId 存为 `rh_task_id`
- `_pipeline_tasks` 追踪管线 Worker，`_poll_tasks` 追踪轮询 Worker
- `cancel` 同时取消 pipeline + poll
- `video_status` 优先读 `_task_store`，内存丢失才尝试 RH 实时查询

### 运行实例 `instanceType`

`lib/runninghub_client.py:253,317` — 所有 RH 任务统一用 `instanceType: "plus"`（48G 显存）。

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

> 详见 [docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md](docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md) 和 [docs/superpowers/specs/2026-06-24-central-activation-design.md](docs/superpowers/specs/2026-06-24-central-activation-design.md)。
> 实施计划见 [docs/superpowers/plans/2026-06-24-electron-desktop-packaging-implementation.md](docs/superpowers/plans/2026-06-24-electron-desktop-packaging-implementation.md)。

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

- [docs/superpowers/specs/](docs/superpowers/specs/) — 每次重大改动的设计文档
- [docs/superpowers/plans/](docs/superpowers/plans/) — 实施计划（task-by-task）
- [docs/superpowers/specs/2026-06-19-video-prompt-panel-design.md](docs/superpowers/specs/2026-06-19-video-prompt-panel-design.md) — 视频提示词面板设计

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

## 待解决：图文视频 / 视频混剪 修复（2026-06-25）

> **状态**：已诊断，待实施。已与用户确认修复方向。

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
