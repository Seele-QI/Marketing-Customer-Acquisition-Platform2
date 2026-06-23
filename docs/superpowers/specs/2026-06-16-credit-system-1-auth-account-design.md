# 用户体系与积分账户设计

> 状态：待用户审阅
> 创建日期：2026-06-16
> 范围：积分系统的第 1 个子项目——**只做**「用户注册/登录」与「积分账户」基础设施，**不做**支付、订阅、UI、计费定价

## 1. 背景与目标

### 1.1 现状
AgentHub 是面向 C 端内容创作者的「AI 文案 + 数字人视频」中台。当前没有用户体系、没有积分系统、没有支付能力：
- **无认证**：用户身份只通过平台 Cookie 绑定，无注册/登录流程
- **无账户**：SQLite 只有 `platform_accounts` 表存平台 Cookie
- **无积分**：AI 成本只在 `lib/cost-tracker.ts` 纯内存记账，无持久化、无用户维度
- **无支付**：`data/` 下无订单/订阅相关表，`.env.example` 中没有任何支付 key

### 1.2 目标
本子项目要解决 3 件事：
1. 让任何访客能通过手机号 + 短信验证码登录，跨设备保持登录态
2. 登录用户拥有一个「积分账户」，可用于未来 AI 功能扣费
3. 任何积分变动都有可追溯的审计记录

### 1.3 非目标（明确不做）
- 支付、充值、套餐、订阅（**下个子项目**）
- 定价策略、各 AI 功能的积分单价（**计费引擎子项目**）
- 用户中心 UI、充值弹窗（**UI 子项目**）
- 多端登录互踢、设备管理、换绑手机号、邀请奖励、签到（YAGNI，等真有了再加）

## 2. 关键决策（与用户确认）

| 维度 | 决策 |
|---|---|
| 认证方式 | 手机号 + 短信验证码 |
| 短信服务商 | 阿里云短信 |
| 积分单位 | 1 积分 = 0.01 元 |
| 初始积分 | 新用户送 100 积分 |
| 积分过期 | 全部不过期 |
| 数据存储 | 沿用现有 SQLite（`data/accounts.db`） |
| 鉴权机制 | HttpOnly Cookie + 后端 session 表 |
| 短信防刷 | 手机号/IP 多维度限频 |
| 登录风控 | 验证码过了就进（最小化方案） |
| 隐私合规 | 默认设过期与脱敏存储 |
| 数据模型 | 方案 A：账户 + 流水（事件溯源） |

## 3. 架构与数据流

### 3.1 总体架构
```
┌─────────────────────────────────────────────────────────┐
│  浏览器                                                   │
│  ├─ 登录页：手机号 + 验证码                                 │
│  └─ 工作台：每个 AI 按钮在调用前查 /api/credit/balance    │
└────────┬─────────────────────────────────────┬───────────┘
         │ 登录/验证                          │ AI 调用
         ▼                                    ▼
┌─────────────────────┐              ┌─────────────────────┐
│  Next.js (3000)     │              │  FastAPI (8000)     │
│  app/api/auth/*     │              │  共享同一个 SQLite   │
│  - send-code        │◄── 共享 ───►│  - /api/ai/rewrite  │
│  - verify-code      │   cookie     │  - /api/agent/chat  │
│  - logout           │   session_id │  - /api/video/*     │
│  - me               │              │                     │
│                     │              │  每个 AI endpoint    │
│                     │              │  调用前会先扣积分    │
└─────────────────────┘              └─────────────────────┘
         │                                    │
         └──────────────┬─────────────────────┘
                        ▼
              ┌─────────────────────┐
              │  data/accounts.db   │
              │  users / sessions   │
              │  credit_accounts    │
              │  credit_ledger      │
              └─────────────────────┘
                        ▲
                        │
              ┌─────────────────────┐
              │  阿里云短信服务      │
              │  (发验证码)          │
              └─────────────────────┘
```

### 3.2 关键设计点
- **Session 共享**：Next.js 与 FastAPI 共用 `accounts.db`，`sessions` 表是「沟通语言」。前端写 cookie + 写 session 行，FastAPI 读 cookie 后查 session 行
- **同源限制**：部署时让 FastAPI 走 `/api/backend/*` 路径（Next.js 反代），cookie 就能同域共享
- **AI 扣费在 FastAPI 侧**：AI 真正的成本发生在 DeepSeek/方舟，扣费与调用放一起是最稳的

## 4. 数据模型

4 张表，与现有 `platform_accounts` 平级。

### 4.1 `users` — 用户身份
```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_hash TEXT UNIQUE NOT NULL,        -- sha256(phone+salt)，不存明文
    phone_masked TEXT NOT NULL,             -- "138****8000" 形式
    nickname TEXT,                          -- 用户可改
    status TEXT NOT NULL DEFAULT 'active',  -- active / banned
    created_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
);
```

### 4.2 `sessions` — 登录态
```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,                    -- 32 字节随机串
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,            -- 30 天后
    last_active_at INTEGER NOT NULL,
    user_agent TEXT,
    ip_first TEXT
);
```

### 4.3 `credit_accounts` — 积分余额（缓存层）
```sql
CREATE TABLE credit_accounts (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
    total_recharged INTEGER NOT NULL DEFAULT 0,
    total_bonus INTEGER NOT NULL DEFAULT 0,
    total_consumed INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
);
```

### 4.4 `credit_ledger` — 流水（事件溯源）
```sql
CREATE TABLE credit_ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,           -- register_bonus / recharge / consume / refund / admin_adjust
    delta INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    ref_id TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX idx_ledger_user_time ON credit_ledger(user_id, created_at);
```

### 4.5 `sms_codes` — 短信验证码
```sql
CREATE TABLE sms_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone_hash TEXT NOT NULL,
    code_hash TEXT NOT NULL,          -- 不存明文
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,      -- 5 分钟
    attempts INTEGER NOT NULL DEFAULT 0,
    used INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_sms_codes_phone ON sms_codes(phone_hash, created_at);
```

### 4.6 流水类型
| type | 含义 | delta 符号 | 触发场景 |
|---|---|---|---|
| `register_bonus` | 注册赠送 | + | 新用户首次登录 |
| `recharge` | 充值到账 | + | 支付回调（未来） |
| `consume` | AI 消费 | − | 调用 AI 之前 |
| `refund` | 失败退款 | + | AI 调用失败/超时 |
| `admin_adjust` | 客服调整 | ± | 投诉/补发 |

### 4.7 核心不变式
**`credit_accounts.balance == SUM(credit_ledger.delta WHERE user_id=?)`**
任何时刻必须成立。由 `recompute_balance()` 函数保证——定时跑、争议时跑、人工对账时跑。

## 5. 组件、接口、关键流程

### 5.1 组件划分
| 组件 | 职责 | 主要文件 |
|---|---|---|
| `auth` | 验证码发送/校验、session 创建/查询/销毁 | `app/api/auth/*` + `lib/auth.py` |
| `credit` | 余额查询、扣费、退款、对账 | `lib/credit.py` + `app/api/credit/*` |
| `account` | 平台账号绑定（已有） | 现有 `accounts.py` 保持不动 |
| `ai-gateway` | AI 调用的"前置扣费"包装层 | `lib/credit.py` 提供 `@require_credit(cost=10)` 装饰器 |
| `rate_limit` | 限频 | `lib/rate_limit.py` |
| `sms` | 阿里云短信 SDK 包装 | `lib/sms.py` |

### 5.2 关键接口

```
POST /api/auth/send-code       发送验证码     body: {phone}
POST /api/auth/verify-code     验证并登录     body: {phone, code}  → Set-Cookie
POST /api/auth/logout          登出           → 清 Cookie + 销毁 session
GET  /api/auth/me              当前用户信息    → {user, balance}

GET  /api/credit/balance       余额查询        → {balance, total_recharged, total_consumed}
GET  /api/credit/ledger?limit=20  流水查询     → [{type, delta, balance_after, note, created_at}, ...]
```

### 5.3 流程 1：发送验证码
```
前端 POST /api/auth/send-code {phone: "138..."}
  ├─ 限频检查 (rate_limit.py)：
  │  ├─ 同 phone 1 分钟 1 次 / 1 小时 5 次 / 1 天 10 次
  │  └─ 同 IP 1 小时 10 次
  ├─ 生成 6 位数字验证码
  ├─ 写 sms_codes (phone_hash, code_hash, expires_at=now+5min, attempts=0)
  └─ 调阿里云短信 SDK 发送
返回 {ok: true}（永远不告诉前端是限频了还是手机号错了——防枚举）
```

### 5.4 流程 2：登录
```
前端 POST /api/auth/verify-code {phone, code}
  ├─ 查 sms_codes，校验未过期 + attempts<5
  ├─ 校验 code 正确（hash 比对）
  ├─ 用 phone_hash 查 users
  │  ├─ 不存在：在同一事务中执行
  │  │   - INSERT users (phone_hash, phone_masked, status='active', created_at, last_seen_at)
  │  │   - INSERT credit_accounts (user_id=new_id, balance=0, total_bonus=0, updated_at)
  │  │   - INSERT credit_ledger (type='register_bonus', delta=+100, balance_after=100, note='注册赠送')
  │  │   - UPDATE credit_accounts SET balance=100, total_bonus=100 WHERE user_id=new_id
  │  └─ 存在：UPDATE last_seen_at
  ├─ INSERT sessions(id=secrets.token_urlsafe(32), expires=+30d)
  ├─ Set-Cookie: session_id=...; HttpOnly; Secure; SameSite=Lax; Max-Age=30d
  └─ 返回 {user: {...}, balance: 100}
```

### 5.5 流程 3：AI 扣费（FastAPI 侧）
```
@require_credit(cost=10, note="AI文案改写") 装饰 AI endpoint
  ├─ BEGIN IMMEDIATE TRANSACTION
  ├─ 查 user_id from session_id (cookie)
  ├─ SELECT balance FROM credit_accounts WHERE user_id=?
  ├─ balance < cost？ → 抛 402 INSUFFICIENT_CREDIT
  ├─ UPDATE credit_accounts SET balance=balance-cost, total_consumed=total_consumed+cost
  ├─ INSERT credit_ledger(type=consume, delta=-cost, balance_after=新余额, ref_id=task_id)
  └─ COMMIT
  ↓
执行真正的 AI 调用
  ↓
  ├─ 成功：原样返回结果
  └─ 失败/超时：
     ├─ BEGIN
     ├─ UPDATE credit_accounts SET balance=balance+cost
     └─ INSERT credit_ledger(type=refund, delta=+cost, ref_id=task_id, note="调用失败退款")
```

### 5.6 前端 AI 调用改造（不在本子项目范围）
- 现有的 `lib/cost-tracker.ts` 改为**只读**——展示余额从 `/api/credit/balance` 拉
- 真正的扣费放在 FastAPI 端（统一入口）
- **本子项目只交付"扣费底层"（`@require_credit` 装饰器 + `credit_ledger` 写入逻辑）**；具体 AI endpoint 的接入、各功能定价，留给「计费引擎」子项目
- 任何对 Next.js 端 AI 路由的迁移重构（chat-stream 等转发到 FastAPI）也属于「计费引擎」子项目

## 6. 错误处理

### 6.1 错误码（统一在 `lib/credit.py` 抛 `CreditError`）

| 场景 | HTTP 状态 | 错误码 | 前端动作 |
|---|---|---|---|
| 未登录 | 401 | `NOT_LOGGED_IN` | 跳登录 |
| 余额不足 | 402 | `INSUFFICIENT_CREDIT` | 弹充值提示（未来）/ 限制使用 |
| 重复扣费（幂等冲突） | 409 | `DUPLICATE_REQUEST` | 重试一次 |
| 并发扣费（超扣防护触发） | 409 | `RACE_CONDITION` | 重试一次 |
| 数据库错误 | 500 | `INTERNAL` | 通用错误页 |

### 6.2 边界情况
1. **并发同账号 2 次 AI 调用**：用 SQLite `BEGIN IMMEDIATE` + 余额 `>= 0` 约束保证不会扣成负
2. **AI 调用超时**：FastAPI 异步任务超时时执行 refund 流程；线程已死的由下次心跳检查修复
3. **验证码轰炸**：同 phone 1 分钟 1 次 / 1 小时 5 次 / 1 天 10 次；同 IP 1 小时 10 次
4. **验证码错误 5 次**：该 code 立即作废，需重发
5. **登录态被劫持**：cookie HttpOnly + Secure + SameSite=Lax + 30 天滚动
6. **手机号换号**：现阶段不支持；用户只能注册新号
7. **数据库被破坏**：`recompute_balance()` 定时跑（每 24h）做对账，差异>0 时报警
8. **老用户迁移**：现在没有任何用户，**无迁移成本**——所有新用户从 0 开始拿 100 积分

## 7. 安全与合规

- **手机号不存明文**：存 `sha256(phone+PHONE_HASH_SALT)`。`PHONE_HASH_SALT` 必须是**环境变量**（不能写在代码里，否则脱库即被批量回查）；首次部署时随机生成 32 字节并写入 `.env`
- **验证码不存明文**：存 `sha256(code)`，5 分钟过期
- **session id**：32 字节 `secrets.token_urlsafe`，数据库唯一
- **Cookie**：`HttpOnly; Secure; SameSite=Lax; Max-Age=30d`
- **日志**：不打印手机号、验证码、session id
- **依赖**：阿里云短信 SDK、SQLite（自带）
- **环境变量**：`ALIYUN_SMS_*`（key/secret/签名/模板）、`PHONE_HASH_SALT`

## 8. 测试策略

不在本次实现，但定义清楚：

- **单元测试**（`tests/test_credit.py`）：扣费/退款/并发/超扣
- **集成测试**（`tests/test_auth.py`）：发送/验证/登录/限频
- **E2E**：用 Playwright 跑一遍"注册→登录→调用 AI→查看流水"
- **对账脚本**（`scripts/reconcile.py`）：cron 每天跑一次，校验 `balance == sum(ledger.delta)`

## 9. 实施步骤（粗略顺序，不在本文展开）

1. 阿里云短信服务开通、签名/模板申请、环境变量配置
2. SQLite 表创建脚本（`scripts/init_credit_db.py`）
3. `lib/auth.py` + `app/api/auth/*` 路由
4. `lib/credit.py` + `app/api/credit/*` 路由
5. `lib/rate_limit.py` 限频
6. 单元测试与集成测试
7. 前端登录页与余额显示 UI（**最简版本**：能用即可，不追求美观）
8. 部署到 Netlify + FastAPI 走同源反代
9. 真实环境联调 1 个 AI endpoint 的扣费链路——本子项目**不**做，作为「计费引擎」子项目的 smoke test

## 10. 未来扩展

- 第 2 子项目：支付（微信/支付宝 + 充值订单）
- 第 3 子项目：计费引擎（AI 功能 → 积分单价映射 + 套餐）
- 第 4 子项目：用户中心 UI（充值、流水可视化、客服后台）
- 远期：多端登录互踢、设备管理、换绑手机号、邀请奖励、签到
