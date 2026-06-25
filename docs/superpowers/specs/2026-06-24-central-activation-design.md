# 中央激活服务设计

> 日期：2026-06-24
> 关联：`2026-06-24-electron-desktop-packaging-design.md`

## 背景

桌面客户端需要一个中央服务来：
1. 校验激活码有效性、过期、机器数限额。
2. 下发 API Key 给激活的客户端（防止反编译拿到明文 Key）。
3. 管理后台生成激活码。
4. 版本检查（`/api/central/manifest`）。

复用以部署好的 `main.py`，**不开新进程**。

## 目标

- 在 `main.py` 末尾追加 5 个路由（约 250 行），**不动现有 30+ 路由**。
- 复用 `_require_admin_key()`（`main.py:72-96`）做 admin 鉴权。
- 复用 `_ACCOUNTS_DB`（`main.py:1997`）做表存储。
- 单独建 2 张表，不影响业务表。

## 数据库表

复用 `data/accounts.db` 同物理文件，加 2 张表：

```sql
CREATE TABLE IF NOT EXISTS central_activation_codes (
    code TEXT PRIMARY KEY,
    plan TEXT NOT NULL DEFAULT 'standard',
    machine_limit INTEGER NOT NULL DEFAULT 1,
    expires_at REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    note TEXT DEFAULT '',
    created_at REAL NOT NULL,
    created_by TEXT DEFAULT 'admin'
);

CREATE TABLE IF NOT EXISTS central_activations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL,
    machine_id TEXT NOT NULL,
    client_version TEXT,
    first_seen_at REAL NOT NULL,
    last_seen_at REAL NOT NULL,
    UNIQUE(code, machine_id)
);
CREATE INDEX IF NOT EXISTS idx_central_activations_machine
    ON central_activations(machine_id);
CREATE INDEX IF NOT EXISTS idx_central_activations_code
    ON central_activations(code);
```

连接时启用 WAL：`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;`

## 路由设计

### `POST /api/central/activate`

**用途**：客户端首次激活，校验激活码 + 下发 API Key。

**请求**：

```python
class ActivateRequest(BaseModel):
    machine_id: str
    code: str
    client_version: str
```

**响应**：

```python
class ActivateResponse(BaseModel):
    ok: bool = True
    plan: str
    expires_at: float
    keys: dict[str, str]   # 密钥池按 plan 取组
    server_time: float
```

**业务逻辑**：

1. 校验 `code` 存在、`status='active'`、`expires_at > now`
2. 查 `central_activations` 当前 code 的 distinct `machine_id` 数；若 >= `machine_limit` 且当前 `machine_id` 不在 → 限额错误
3. `INSERT OR IGNORE` 同一 code+machine_id 视为续期（更新 `last_seen_at`）
4. 从 env `CENTRAL_KEY_POOL_JSON` 按 `plan` 取密钥组返回

**错误码**：

| code | status | 含义 |
|---|---|---|
| `CODE_NOT_FOUND` | 400 | 激活码不存在 |
| `CODE_EXPIRED` | 400 | 已过期 |
| `CODE_DISABLED` | 403 | 已停用 |
| `MACHINE_LIMIT_REACHED` | 403 | 机器数已满 |
| `CENTRAL_DB_ERROR` | 500 | DB 故障 |

### `GET /api/central/manifest?client_version=0.1.0`

**用途**：客户端启动时检查更新。

**响应**：

```python
class ManifestResponse(BaseModel):
    latest_version: str
    min_supported_version: str
    update_url: str           # GitHub Releases URL
    force_update: bool
    release_notes: str
```

MVP 阶段硬编码（env `CENTRAL_LATEST_VERSION` / `CENTRAL_FORCE_UPDATE_BELOW`），后期接入 DB。

### `POST /api/central/heartbeat`

**用途**：客户端周期性心跳（每 24h 一次）。

**请求**：`{ machine_id, code, client_version, ts }`

**响应**：`{ ok, server_time, revoked }` —— `revoked=true` 时客户端清凭证重启向导。

### `GET /api/central/admin/codes`

**鉴权**：复用 `main.py:_require_admin_key()`（line 72-96，`X-Admin-Key` 头）。

**响应**：

```python
[
    {
        "code": "ZT-XXXX-XXXX-XXXX",
        "plan": "standard",
        "machine_limit": 1,
        "expires_at": 1798761600,
        "status": "active",
        "used_count": 1,
        "created_at": 1700000000,
        "note": ""
    }
]
```

实现：JOIN `central_activation_codes` + `central_activations` 计数。

### `POST /api/central/admin/codes`

**鉴权**：同上。

**请求**：

```python
class CreateCodeRequest(BaseModel):
    plan: str = 'standard'
    machine_limit: int = 1
    expires_in_days: int = 365
    count: int = 1
    note: str = ''
```

**响应**：`{ created: ['ZT-XXXX-XXXX-XXXX', ...] }`

**生成算法**：

```python
import secrets, string
ALPHABET = string.ascii_uppercase + string.digits
def _gen_code() -> str:
    raw = ''.join(secrets.choice(ALPHABET) for _ in range(12))
    return f"ZT-{raw[0:4]}-{raw[4:8]}-{raw[8:12]}"
```

排除易混淆字符（`0/O/1/I/L`）—— TODO v2。

## 环境变量（同步到 `CLAUDE.md` 和 `.env.example`）

```env
# 密钥池：按 plan 分组，运行时下发
CENTRAL_KEY_POOL_JSON={"standard":{"DEEPSEEK_API_KEY":"sk-...","RUNNINGHUB_API_KEY":"..."},"pro":{...}}

# 版本检查
CENTRAL_LATEST_VERSION=0.1.0
CENTRAL_FORCE_UPDATE_BELOW=0.0.1
CENTRAL_UPDATE_URL=https://github.com/<org>/zhongtai-desktop/releases/latest
```

## 安全考量

1. **CORS**：仅允许 Electron 客户端域名 + 管理后台 IP 白名单，不放 `*`。
2. **限速**：每个 IP 每分钟 ≤ 10 次激活请求（防爆破激活码）。
3. **审计日志**：所有激活请求记录 IP / UA / 激活码到 `central_audit_log` 表（MVP 可省略）。
4. **激活码强度**：12 字符 ALPHABET（36 选 12）= 36^12 ≈ 4.7×10^18 组合，足够安全。

## 验收

- 4 个错误码（`CODE_NOT_FOUND` / `CODE_EXPIRED` / `CODE_DISABLED` / `MACHINE_LIMIT_REACHED`）路径覆盖
- 管理后台 `GET/POST /api/central/admin/codes` 鉴权正常
- 密钥池读取正常，激活后客户端能拿到正确 key
- WAL 模式下并发安全（FastAPI 多 worker 不锁）