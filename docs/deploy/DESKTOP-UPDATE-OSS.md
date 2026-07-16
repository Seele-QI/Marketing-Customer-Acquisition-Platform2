# 桌面自动更新（阿里云 OSS + FastAPI manifest）

策略在云端 API，安装包在 OSS，**不单独起第三服务**。

## 架构

| 层 | 组件 | 作用 |
|----|------|------|
| 策略 | `GET /api/central/manifest` | `CENTRAL_LATEST_VERSION` / `CENTRAL_FORCE_UPDATE_BELOW` / `CENTRAL_UPDATE_URL` / 可选 `CENTRAL_RELEASE_NOTES` |
| 分发 | 阿里云 OSS `.../releases/` | `招财猫-Setup-x.y.z.exe` + `latest.yml` (+ blockmap) |
| 客户端 | `electron-updater` + **设置页** | 检查 / 下载进度 / 安装重启；启动可静默检查与强更 |

## 用户路径

| 模式 | 行为 |
|------|------|
| **软更** | 启动后托盘提示「发现新版本」→ 用户打开 **设置 → 应用更新** → 检查 / 下载 / 安装并重启 |
| **强更** | `client_version < CENTRAL_FORCE_UPDATE_BELOW` → 启动阻断 → **应用内下载** → `quitAndInstall`（不打开浏览器）|

## OSS 准备（控制台一次）

1. 阿里云 → 对象存储 → 华北2（北京）创建 Bucket，例如 `mcap-desktop-releases`
2. 读写权限：公网读安装包（或绑定 CDN），禁止公开列举时可用「公共读」仅对象级
3. 目录约定：`releases/`
4. 公网基址示例：
   - OSS：`https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/`

把该基址写入：

- Zeabur **api** 环境变量 `CENTRAL_UPDATE_URL`（同上，末尾 `/`）
- 构建机 `.env.electron-build.local` → `UPDATE_FEED_URL`（同上）
- 可选根 `.env` / 打包 `resources/.env` → `UPDATE_FEED_URL`（运行时 `setFeedURL`）

## 构建机环境

`.env.electron-build.local`：

```env
CLOUD_API_URL=https://mcap-cloud-api.preview.aliyun-zeabur.cn
UPDATE_FEED_URL=https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/

# 上传用（勿提交 Git）
OSS_REGION=oss-cn-beijing
OSS_BUCKET=mcap-desktop-releases
OSS_ACCESS_KEY_ID=
OSS_ACCESS_KEY_SECRET=
OSS_PREFIX=releases
```

## 发版流程

```powershell
pnpm resources:build
pnpm preflight
pnpm dist:win
pnpm release:upload-oss
```

然后按脚本打印的核对清单：

1. 确认 `latest.yml` 公网可访问  
2. Zeabur api：`CENTRAL_LATEST_VERSION` = 本包版本  
3. **仅重大不兼容**时抬高 `CENTRAL_FORCE_UPDATE_BELOW`  
4. `CENTRAL_UPDATE_URL` 与客户端 `UPDATE_FEED_URL` 指向同一 OSS `releases/`  
5. 可选填写 `CENTRAL_RELEASE_NOTES`，Redeploy api  

## 本地上传脚本

```powershell
pnpm release:upload-oss
# 或指定目录
node scripts/upload-release-oss.mjs --dir release
```

## 验收

1. 浏览器打开 `UPDATE_FEED_URL/latest.yml` 能下载  
2. 旧版客户端：设置页「检查更新」能发现新版本并下载安装  
3. 将 `CENTRAL_FORCE_UPDATE_BELOW` 抬到高于当前包版本时，启动应进入应用内强更下载并重启安装  
4. `GET {CLOUD_API_URL}/api/central/manifest?client_version=0.0.1` 返回 JSON（非 404）

### 若云端 api 精简镜像仍缺 `/api/central/manifest`

根因：现网 `zhongtai-cloud-api` 多为精简云端镜像（含 auth / config/sync，不含 central 路由）。可选修复：

1. **旁路服务（推荐）**：用 [`Dockerfile.central-manifest`](../../Dockerfile.central-manifest) 新建 Zeabur 服务，绑定域名后把 `CLOUD_MANIFEST_URL` 写入桌面 `resources/.env`  
2. **Next 补齐**：本仓已实现 [`app/api/central/manifest/route.ts`](../../app/api/central/manifest/route.ts)，重新部署 `zhongtai-cloud-web`（需带本仓 Next）后，客户端会自动探测 `mcap-cloud-web.*`  
3. **完整 api 镜像**：用本仓 [`Dockerfile.api`](../../Dockerfile.api) 重部署（注意可能与现网 `config/sync` 分仓逻辑冲突，需先对照）  
4. **本地兜底**：打包 env 写入 `CENTRAL_FORCE_UPDATE_BELOW` / `CENTRAL_LATEST_VERSION`，Electron 在所有 manifest 探测失败时按本地门槛判定强更  

验收脚本：`node scripts/verify-central-manifest.mjs`  
本地 sidecar 冒烟：`python -m uvicorn services.central_manifest.app:app --port 18080`
