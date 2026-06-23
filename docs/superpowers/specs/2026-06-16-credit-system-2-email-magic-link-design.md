# 邮箱 Magic Link 认证 — 设计稿

> 状态：已批准，开始实施
> 范围：替换现有手机号短信认证为邮箱 Magic Link 登录

## 1. 决策

| 维度 | 决策 |
|---|---|
| 认证方式 | 邮箱 + Magic Link（无密码） |
| 邮件服务商 | Resend（免费 100 封/天） |
| API 路由名 | `send-link` / `verify-token` |
| Token TTL | 15 分钟 |
| 过渡策略 | 完全替换（清空 3 个测试用户） |
| 关键页 | `/auth/verify?token=xxx` 自动登录并跳回主页 |

## 2. 数据库

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT UNIQUE NOT NULL,        -- sha256(EMAIL_HASH_SALT + email)
    email_masked TEXT NOT NULL,             -- "f**@gmail.com"
    nickname TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);

CREATE TABLE sessions ( ... );             -- 不变
CREATE TABLE credit_accounts ( ... );      -- 不变
CREATE TABLE credit_ledger ( ... );        -- 不变

CREATE TABLE email_tokens (                -- 替代 sms_codes
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email_hash TEXT NOT NULL,
    token_hash TEXT NOT NULL,              -- sha256(token)
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    used_at INTEGER
);
CREATE INDEX idx_email_tokens_email ON email_tokens(email_hash, created_at);
```

**users 表 5 张表的 credit_* 不动**——积分系统骨架复用。

## 3. 流程

### 3.1 发送链接
```
POST /api/auth/send-link { email }
  ├─ 限频检查（email: 1/min, 5/hour, 10/day; ip: 10/hour）
  ├─ 生成 32 字节随机 token (base64url)
  ├─ 存 email_tokens (email_hash, sha256(token), expires_at=now+15min)
  └─ Resend 发邮件："点击登录 AgentHub：https://app/auth/verify?token=xxx"

dev mode (DEV_EMAIL_MODE=1)：链接打到 FastAPI 日志，不真发
```

### 3.2 验证链接
```
GET /auth/verify?token=xxx  → Next.js page
  ├─ 渲染 loading
  ├─ POST /api/auth/verify-token { token }
  │   ├─ 查 email_tokens WHERE token_hash = sha256(token) AND used=0 AND expires > now
  │   ├─ 标记 used=1
  │   ├─ get_or_create_user(email) → 注册送 100 积分
  │   └─ create_session → Set-Cookie session_id
  ├─ 跳 / (主页)
  └─ 主页读 cookie 显示已登录 + 100 积分
```

## 4. 安全

- token: `secrets.token_urlsafe(32)` 存 hash，明文只发邮件
- EMAIL_HASH_SALT: 32 字节随机，环境变量
- 一次性使用：used=1 立即作废
- 不告诉前端 email 是否注册（防枚举）
- 错误信息统一："链接无效或已过期"

## 5. 文件改动清单

| 文件 | 类型 |
|---|---|
| `scripts/init_credit_db.py` | 改：phone → email，sms_codes → email_tokens |
| `lib/db.py` | 不变 |
| `lib/auth.py` | 改：所有 phone_* → email_* |
| `lib/sms.py` → `lib/email.py` | 改：Aliyun SDK → Resend SDK |
| `lib/rate_limit.py` | 改：phone → email |
| `lib/credit.py` | 不变 |
| `main.py` | 改：5 个路由 |
| `app/api/auth/{send-link,verify-token,logout,me}/route.ts` | 改：4 个 |
| `app/api/credit/{balance,ledger}/route.ts` | 不变 |
| `app/auth/verify/page.tsx` | 新建 |
| `components/credit/credit-badge.tsx` | 改：邮箱输入 |
| `components/user-menu.tsx` | 改：邮箱输入 |
| `tests/test_auth.py` | 改 |
| `.env.example` | 改：删 Aliyun，加 Resend |
| `requirements.txt` | 改：删 aliyun，加 resend |
| `启动指南.md` | 改：替换启动流程 |

## 6. 不做（YAGNI）

- 密码登录
- 多端互踢 / 设备管理
- OAuth 第三方
- 邮箱验证链接 vs 验证码二选一（只做链接）
- 已登录用户换绑邮箱
- 注册邮箱白名单