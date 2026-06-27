# AgentHub 公网部署指南（Docker + 托管 PaaS）

> 推荐路径：**Docker 双镜像**（`Dockerfile.web` + `Dockerfile.api`）部署到 Zeabur / Railway / Fly.io 等。  
> 完整方案说明见仓库内规划文档；本文是可执行的运维手册。

## 架构概览

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| **web** | `Dockerfile.web` | 3000 | Next.js standalone，API Routes 代理 FastAPI |
| **api** | `Dockerfile.api` | 8000 | FastAPI + ffmpeg，Volume 挂载 `/data` |

## 环境变量（关键）

### web 服务

| 变量 | 示例 | 说明 |
|------|------|------|
| `FASTAPI_URL` | `http://api:8000` | **仅服务端**：Next `proxyToFastapi` 内网地址 |
| `NEXT_PUBLIC_FASTAPI_URL` | `https://api.example.com` | **浏览器**：视频 static、直连 FastAPI |
| `NODE_ENV` | `production` | |

### api 服务

| 变量 | 示例 | 说明 |
|------|------|------|
| `DATA_DIR` | `/data` | 视频缓存根目录 |
| `CREDIT_DB_OVERRIDE` | `/data/accounts.db` | SQLite |
| `VIDEO_BGM_DIR` | `/app/assets/bgm` | 镜像内 BGM |
| `APP_PUBLIC_BASE` | `https://www.example.com` | Magic Link 邮件回调 |
| `CORS_ALLOW_ORIGINS` | `https://www.example.com` | 生产勿用 `*` |
| `DEV_EMAIL_MODE` | `0` | 生产必须真实发信 |

其余 Key 见 [`.env.example`](../.env.example) 与 [CLAUDE.md](../CLAUDE.md)。

## Zeabur 部署步骤

1. 将仓库连接到 Zeabur，导入 [`zeabur.json`](../zeabur.json) 双服务定义。
2. **api** 服务：
   - 挂载 Volume → 容器路径 `/data`
   - 在控制台填入 api 段环境变量 + AI Key Secret
   - 绑定域名 `api.example.com`，启用 HTTPS
3. **web** 服务：
   - `FASTAPI_URL=http://api:8000`（Zeabur 内网服务名以控制台为准）
   - `NEXT_PUBLIC_FASTAPI_URL=https://api.example.com`（替换为真实 api 域名）
   - 绑定域名 `www.example.com`
4. 健康检查：
   - api：`GET /health`（200 且 `ffmpeg: ok`）
   - web：`GET /api/health`（代理到 api）
5. 冒烟：登录 → 数字人口播 / 图文视频 / 混剪 → 下载 `.mp4`

## 本地 Docker Compose 预演

```bash
cp .env.example .env
# 编辑 .env 填入 Key；将 compose 中 example.com 改为你的域名或 localhost

docker compose build
docker compose up -d
curl http://localhost:8000/health
curl http://localhost:3000/api/health
```

## Ingress / 反代（自建 VPS 时）

参考 [`deploy/nginx.conf.example`](../deploy/nginx.conf.example)：

- `client_max_body_size 512m`（混剪大 JSON）
- `proxy_read_timeout 600s`（首次 POST 解码）
- api 子域转发 `/static/video-postprocess/` 到 api:8000

## 备份与清理

```bash
# 每日备份 SQLite（cron 或平台定时任务）
./scripts/backup-data.sh /data /backup

# 清理 14 天前的视频任务目录
node scripts/cleanup-video-cache.mjs --data-dir /data --max-age-days 14
```

## CI/CD

推送 `main` 后 [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml) 会：

1. 运行 pytest + node 单元测试
2. 构建并推送 `web` / `api` 镜像到 GHCR
3. （可选）通过 Repository Secret 触发 PaaS 重新部署

需在 GitHub Settings → Secrets 配置：

- `DEPLOY_WEBHOOK_URL`（可选）：Zeabur/Railway 部署 webhook

## 上线检查清单

- [ ] `DEV_EMAIL_MODE=0`
- [ ] `FASTAPI_URL` 内网 + `NEXT_PUBLIC_FASTAPI_URL` 公网 HTTPS
- [ ] api Volume `/data` 已挂载
- [ ] CORS / APP_PUBLIC_BASE 与主站域名一致
- [ ] `/health` 与 `/api/health` 返回 200
- [ ] 备份 cron 已配置
