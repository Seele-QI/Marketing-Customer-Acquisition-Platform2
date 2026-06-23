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
│   ├── video-creation-workflow.tsx   # 视频创作主流程
│   └── ...
├── lib/                    # 工具与共享代码
│   ├── video/              # 视频模块类型 + 客户端 API 封装
│   ├── video_postprocess.py    # ffmpeg 通用剪辑模板（端到端）
│   ├── video-task-store.ts # localStorage 任务状态持久化
│   ├── runninghub_client.py    # RunningHub 远程工作流客户端
│   ├── credit.py           # 积分账本
│   └── auth.py             # 邮箱 Magic Link 认证
├── main.py                 # FastAPI 后端（视频生成、剪辑、积分）
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
