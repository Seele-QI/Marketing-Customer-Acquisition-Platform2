# Zeabur 部署操作手册（mcap-prod-test1）

> 配合 [zeabur-env.example](./zeabur-env.example) 与 [桌面版发布＋云端部署+安装包制作.md](./桌面版发布＋云端部署+安装包制作.md) 使用。  
> **迁到阿里云北京 4C8G**：见 [ZEABUR-BEIJING-MIGRATE.md](./ZEABUR-BEIJING-MIGRATE.md)。  
> **桌面自动更新（OSS）**：见 [DESKTOP-UPDATE-OSS.md](./DESKTOP-UPDATE-OSS.md)。

## 生产域名（阿里云北京 Zeabur preview；香港旧机保留）

| 服务 | 域名 |
|------|------|
| api | `https://mcap-cloud-api.preview.aliyun-zeabur.cn` |
| web | `https://mcap-cloud-web.preview.aliyun-zeabur.cn` |

验收：`node scripts/verify-beijing-cutover.mjs --phase prod`

## 1. 生成本地密钥

```powershell
node scripts/generate-zeabur-secrets.mjs --admin-password "你的强密码"
python scripts/generate-central-signing-keys.py
```

将输出填入 Zeabur 控制台 **Environment**，勿提交 Git。

## 2. 创建双服务

在 Zeabur 项目 `mcap-prod-test1` 中：

| 服务名 | 构建方式 | Dockerfile | 容器端口 | 说明 |
|--------|----------|------------|----------|------|
| **api** | **Docker**（自定义镜像） | `Dockerfile.api`（项目根目录） | **8000** | FastAPI + ffmpeg + 积分库 |
| **web** | **Docker**（自定义镜像） | `Dockerfile.web`（项目根目录） | **3000** | Next.js **standalone 运行时**（`node server.js`） |

### ⚠️ 不要用 PREBUILT_V2 / Caddy 静态模板

Zeabur 若自动识别为 **PREBUILT_V2**，会用 **Caddy** 托管 `/usr/share/caddy` 静态文件。  
本项目 web 是 **Next.js App Router + API Routes**（`output: "standalone"`），必须跑 **Node.js 进程**，不是静态站。

| 错误形态 | 正确形态 |
|----------|----------|
| 服务类型 PREBUILT_V2 | 服务类型 **Docker** |
| Caddy 监听 `:8080` | `node server.js` 监听 **`:3000`** |
| `/usr/share/caddy` 为空 → 502 | `.next/standalone` 已构建进镜像 |

**若 web 已是 PREBUILT_V2：** 删除该服务 → 重新添加 → 选「从 GitHub 部署」→ 构建类型选 **Dockerfile** → 路径填 `Dockerfile.web`（根目录）→ 端口 **3000**。

**不要手动设置** `PORT=${WEB_PORT}`，删掉 `PORT` 让镜像默认 `PORT=3000` 生效。

推荐：**GitHub 连接仓库** → 导入 [`zeabur.json`](../zeabur.json) 或手动指定上述 Dockerfile 路径。

## 3. api 服务配置

### Volume

- 挂载名：`data`
- 容器路径：`/data`

### 环境变量（必填）

| 变量 | 值 |
|------|-----|
| `DATA_DIR` | `/data` |
| `CREDIT_DB_OVERRIDE` | `/data/accounts.db` |
| `VIDEO_BGM_DIR` | `/app/assets/bgm` |
| `DEV_EMAIL_MODE` | `0` |
| `EMAIL_HASH_SALT` | 见 generate 脚本 |
| `CREDIT_ADMIN_ACCESS_KEY` | 见 generate 脚本 |
| `DEEPSEEK_API_KEY` | 你的 Key |
| `RUNNINGHUB_API_KEY` | 你的 Key |
| `RUNNINGHUB_IMAGE_API_KEY` | 海外图片工作台与封面图 Key |
| `RUNNINGHUB_IMAGE_BASE_URL` | `https://www.runninghub.ai/openapi/v2` |
| `CORS_ALLOW_ORIGINS` | `https://<web域名>.zeabur.app` |
| `APP_PUBLIC_BASE` | `https://<web域名>.zeabur.app` |
| `CENTRAL_SIGNING_PRIVATE_KEY` | 见 generate-central-signing-keys |
| `CENTRAL_SIGNING_KEY_ID` | `v1` |
| `CENTRAL_LATEST_VERSION` | `0.1.0` |

### 域名

绑定 Zeabur 域名，例如：`zhongtaiapi.zeabur.app`

### 健康检查

```bash
curl https://zhongtaiapi.zeabur.app/health
# 期望：200 且 ffmpeg: ok
```

## 4. web 服务配置

| 变量 | 值 |
|------|-----|
| `NODE_ENV` | `production` |
| `FASTAPI_URL` | `http://api.zeabur.internal:8000` |
| `NEXT_PUBLIC_FASTAPI_URL` | `https://zhongtaiapi.zeabur.app` |
| `CREDIT_ADMIN_ACCESS_KEY` | 与 api 相同 |
| `ADMIN_LOGIN_NAME` | 管理员账号 |
| `ADMIN_PASSWORD_HASH` | 见 hash-admin-password |
| `ADMIN_PASSWORD_SALT` | 见 hash-admin-password |

### 域名

例如：`zhongtai.zeabur.app`

### 健康检查

```bash
curl https://zhongtai.zeabur.app/api/health
```

## 5. M1 验收清单

- [ ] 访问 web 域名，页面正常加载
- [ ] 前台注册账号 + 密码登录成功
- [ ] 访问 `/admin/credit`，管理员登录成功
- [ ] 「用户管理」Tab 能看到刚注册用户
- [ ] 手动调账后余额变化正确
- [ ] 兑换码生成 / 批次查看正常

## 6. 桌面端连通（M3）

构建机 `.env.electron-build.local` 设置：

```env
CLOUD_API_URL=https://mcap-cloud-api.preview.aliyun-zeabur.cn
CENTRAL_SERVICE_URL=https://mcap-cloud-api.preview.aliyun-zeabur.cn
UPDATE_FEED_URL=https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/
CENTRAL_SIGNING_PUBLIC_KEY=<公钥 PEM>
```

桌面 prod 行为：

- auth / credit → 云端 `CLOUD_API_URL`
- video / ffmpeg → 本地 `127.0.0.1:8010`（扣费仍委托云端）

## 7. 域名替换说明

[zeabur.json](../zeabur.json) 使用占位域名 `mcap-prod-test1-*.zeabur.app`。Zeabur 实际分配域名可能不同，部署后在控制台复制真实域名，同步更新：

- Zeabur Environment
- `zeabur.json`（可选，便于下次导入）
- `.env.electron-build.local`

## 8. 故障排查

| 症状 | 检查 |
|------|------|
| web 502 + Caddy / PREBUILT_V2 | 改为 Docker 构建 `Dockerfile.web`（根目录），端口 3000，删除 `PORT=${WEB_PORT}` |
| web 502 + 构建日志 output 为空 | 确认 Dockerfile 路径为 `Dockerfile.web`（勿用根目录占位 `Dockerfile`） |
| web 503 FASTAPI | `FASTAPI_URL` 是否为 `http://api.zeabur.internal:8000` |
| 管理员 403 | web 与 api 的 `CREDIT_ADMIN_ACCESS_KEY` 是否一致 |
| CORS 错误 | `CORS_ALLOW_ORIGINS` 是否含 web 域名 |
| 用户列表空 | api Volume 是否挂载；是否在同一 api 实例注册 |
| 桌面登录失败 | `CLOUD_API_URL` 是否 HTTPS 可达 |
