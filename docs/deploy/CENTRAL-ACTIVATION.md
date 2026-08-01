# 中央激活服务部署指南

桌面 Electron 客户端首次启动需联网调用中央 FastAPI 的 `/api/central/*` 路由，校验激活码并下发 API Key。服务端逻辑已在仓库根 [`main.py`](../../main.py) 内，无需单独代码仓库。

## 架构

```text
Windows 客户端 (.exe)
  → HTTPS POST /api/central/activate
中央 FastAPI（公网）
  → SQLite central_activation_codes
  → CENTRAL_KEY_POOL_JSON（按 plan 下发 Key）
  → Ed25519 签名响应（CENTRAL_SIGNING_PRIVATE_KEY）
```

## 1. 生成签名密钥对

```bash
python scripts/generate-central-signing-keys.py
```

将输出的 `CENTRAL_SIGNING_PRIVATE_KEY` / `CENTRAL_SIGNING_KEY_ID` 写入**中央服务器** `.env`；将 `CENTRAL_SIGNING_PUBLIC_KEY` 写入 Electron 构建环境（[`.env.electron-build.example`](../../.env.electron-build.example)）。

## 2. 中央服务器最小 `.env`

```env
# AI Key 池（按 plan 名称分组，与激活码 plan 字段对应）
CENTRAL_KEY_POOL_JSON={"RUNNINGHUB_API_KEY":"replace-me"}

CENTRAL_SIGNING_PRIVATE_KEY=<Ed25519 seed base64 或 PEM>
CENTRAL_SIGNING_KEY_ID=v1
CENTRAL_LATEST_VERSION=0.1.0
CENTRAL_FORCE_UPDATE_BELOW=0.0.1
CENTRAL_UPDATE_URL=

CREDIT_DB_OVERRIDE=/data/accounts.db
CREDIT_ADMIN_ACCESS_KEY=<强随机，用于创建激活码>

# 其余 FastAPI 必填项见 .env.example（邮件、EMAIL_HASH_SALT 等）
```

公钥校验端点（调试）：`GET /api/central/signing-public-key`

## 3. 部署形态

### 方案 A：Zeabur / Docker 第二个服务（推荐）

1. 使用与主站相同的 [`Dockerfile.api`](../../Dockerfile.api) 构建镜像。
2. 新建服务 `api-central`，挂载 Volume `/data`，填入上述 `CENTRAL_*` 变量。
3. 绑定独立域名，例如 `https://central.example.com`，启用 HTTPS。
4. 健康检查：`GET /health`

参考主站 PaaS 手册：[PAAS.md](./PAAS.md)。

### 方案 B：独立 VPS

```bash
pip install -r requirements.txt
export $(grep -v '^#' .env | xargs)
uvicorn main:app --host 0.0.0.0 --port 8000
```

前方 Caddy/Nginx 终止 TLS，反代到 8000。

## 4. 创建激活码

### 脚本（推荐）

```bash
export CENTRAL_SERVICE_URL=https://central.example.com
export CREDIT_ADMIN_ACCESS_KEY=你的管理员密钥

python scripts/create-activation-codes.py --count 5 --plan standard --expires-in-days 365 --note "2026-Q2"
```

### curl

```bash
curl -sS -X POST "https://central.example.com/api/central/admin/codes" \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: $CREDIT_ADMIN_ACCESS_KEY" \
  -d '{"plan":"standard","count":1,"machine_limit":1,"expires_in_days":365,"note":"manual"}'
```

## 5. 外网验收

```bash
# 公钥可读
curl -sS https://central.example.com/api/central/signing-public-key

# 激活（需有效码）
curl -sS -X POST https://central.example.com/api/central/activate \
  -H "Content-Type: application/json" \
  -d '{"machine_id":"test-machine","code":"YOUR-CODE","client_version":"0.1.0"}'
```

成功响应应含 `keys`、`signature`、`server_time`。

## 6. 客户端构建配置

出包前在构建机设置：

```env
CENTRAL_SERVICE_URL=https://central.example.com
CENTRAL_SIGNING_PUBLIC_KEY=<公钥 PEM>
```

详见 [ELECTRON-BUILD.md](./ELECTRON-BUILD.md)。

## 常见问题

| 现象 | 原因 |
|------|------|
| 激活「签名校验失败」 | 客户端公钥与服务器私钥不匹配 |
| 激活「无效激活码」 | 码未创建、已过期或已吊销 |
| 503 未配置私钥 | 中央服务未设置 `CENTRAL_SIGNING_PRIVATE_KEY` |
| 桌面能激活但视频 503 | Key 池 JSON 缺少对应 plan 或 Key 无效 |
