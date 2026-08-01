# 企业智能体 DeepSeek 专用通道：云端修改需求与边界

> 文档日期：2026-07-26
> 适用范围：云端配置服务、模型渠道管理后台、`POST /api/config/sync`、承载上述服务的现有数据库
> 客户端消费方：AI 中台桌面端与 Next.js 服务端的企业智能体模块

## 1. 目标

云端为“企业智能体团队”单独下发一个或多个 DeepSeek 快速模型渠道，使总协调官、主责部门和会签部门只使用该专用渠道执行任务。

本次修改必须同时满足：

1. 企业智能体渠道与文案创作、GEO、视频等通用模型渠道隔离。
2. 客户端仍通过现有 `POST /api/config/sync` 获取完整配置。
3. 不向客户端开放模型选择，不接受客户端传入模型 ID。
4. 不删除、覆盖、重建或清空原数据库及任何原有模型渠道。
5. 旧版本客户端继续正常同步和使用原有模型渠道。

## 2. 推荐实施方式

在现有模型渠道数据源中**新增独立渠道记录**，不要修改原有通用 DeepSeek 渠道的用途和优先级。

优先级顺序：

1. 如果现有渠道记录已经支持 `extra` JSON/对象：只新增数据，数据库结构零变更。
2. 如果现有记录没有可承载扩展属性的字段：通过幂等、仅增加字段的迁移新增可空 `extra` JSON/TEXT 字段。
3. 不新建另一套账号库、积分库或业务数据库。
4. 不把企业智能体标记写进用户、订单、积分或任务历史表。

不采用以下方案：

- 把现有通用 DeepSeek 渠道直接改成企业智能体专用渠道；
- 通过提高普通 DeepSeek 渠道优先级实现“看起来像专用”；
- 为这次功能重建数据库或替换数据库文件；
- 让客户端根据名称猜测渠道用途；
- 在客户端硬编码 API Key、模型 ID 或服务地址。

## 3. 云端渠道数据合同

新增渠道必须完整包含以下字段：

| 字段 | 要求 | 说明 |
|---|---|---|
| `id` | 必填，唯一数字 | 使用现有数据库生成策略，不得复用旧 ID |
| `kind` | 固定为 `llm` | 模型类型 |
| `name` | 建议 `企业智能体 DeepSeek 快速通道` | 名称中应能识别 DeepSeek，但客户端不依赖名称判断用途 |
| `adapter` | 固定为 `openai_chat` | 当前客户端使用 OpenAI Chat Completions 兼容协议 |
| `base_url` | 必填 | 可为 API 根地址或兼容地址，云端需与现有序列化规则保持一致 |
| `api_key` | 必填、加密保存 | 不得写入日志、响应错误、代码仓库或普通配置文件 |
| `model` | 必填 | 必须是实际可调用的 DeepSeek 快速模型 ID |
| `priority` | 必填 | 只决定企业智能体专用候选内部的故障切换顺序 |
| `extra.purpose` | 固定为 `enterprise_agent` | 企业智能体专用标识 |
| `extra.performance_tier` | 固定为 `fast` | 快速通道标识 |
| `extra.supports_images` | 布尔值 | 只有端点真实支持图片输入时才允许为 `true` |

`base_url` 兼容边界：客户端会去除末尾 `/`；如果地址末尾不是 `/v数字`，会自动补成
`/v1/chat/completions`；如果已经以 `/chat/completions` 结尾则直接使用。云端上线前必须按
最终生成的 URL 做一次真实非流式 Chat Completions 请求，不能只验证域名可访问。

标准下发结构：

```json
{
  "id": 1201,
  "kind": "llm",
  "name": "企业智能体 DeepSeek 快速通道",
  "adapter": "openai_chat",
  "base_url": "https://provider.example",
  "api_key": "<encrypted-or-secret-value>",
  "model": "deepseek-fast-model",
  "priority": 20,
  "extra": {
    "purpose": "enterprise_agent",
    "performance_tier": "fast",
    "supports_images": false
  }
}
```

### 3.1 图片能力边界

- `supports_images=true` 是能力声明，不是产品开关。
- 必须先使用真实图片请求验证该模型端点支持当前 OpenAI 兼容消息结构，才能设置为 `true`。
- 如果 DeepSeek 快速端点不支持图片，必须设置为 `false`；含图片任务将返回“没有可用专用模型”，不得偷偷回退到 GPT、Claude、豆包或普通 DeepSeek 渠道。
- 如需支持图片，应在同一企业智能体用途下新增一个经过验证的 DeepSeek 多模态快速渠道，并设置更合适的优先级。

## 4. `POST /api/config/sync` 修改要求

现有客户端请求保持不变：

```json
{
  "client_version": "0.1.0",
  "known_version": "cfg_previous"
}
```

配置发生变化时，响应必须返回**完整快照**：

```json
{
  "config_version": "cfg_20260726_agent_fast_01",
  "unchanged": false,
  "keys": {
    "...": "保留现有全部键值"
  },
  "providers": [
    {
      "...": "保留所有原有渠道，字段和值不变"
    },
    {
      "id": 1201,
      "kind": "llm",
      "name": "企业智能体 DeepSeek 快速通道",
      "adapter": "openai_chat",
      "base_url": "https://provider.example",
      "api_key": "<secret>",
      "model": "deepseek-fast-model",
      "priority": 20,
      "extra": {
        "purpose": "enterprise_agent",
        "performance_tier": "fast",
        "supports_images": false
      }
    }
  ]
}
```

硬性要求：

1. `providers` 是全量快照，不是增量补丁。
2. 新增企业智能体渠道后，原有渠道数量、ID、类型、模型、优先级和密钥引用必须保持不变。
3. `keys` 也必须保留完整；不得因为本次只修改模型渠道而返回空对象。
4. 每次配置内容变化必须生成新的 `config_version`。
5. 当 `known_version` 等于当前版本时，可返回：

```json
{
  "config_version": "cfg_20260726_agent_fast_01",
  "unchanged": true
}
```

6. 未登录返回 `401`，账号禁用或无权限返回 `403`；不得在错误响应中包含渠道密钥。
7. 新旧客户端均可读取原字段；旧客户端不识别 `extra` 时应忽略它，不能因此同步失败。

## 5. 数据库保护红线

### 5.1 永久禁止

本次发布禁止执行或变相执行：

- `DROP DATABASE`、`DROP TABLE`；
- 对原有表执行 `TRUNCATE`；
- 无条件 `DELETE` 原有渠道、用户、积分、任务、知识库或审计记录；
- `CREATE OR REPLACE` 覆盖现有数据对象；
- 删除并重建 SQLite、PostgreSQL 或平台 Volume；
- 用空数据库、测试数据库或本地数据库文件覆盖生产数据库；
- 未核对完整环境变量集合时整体替换 Zeabur 服务环境变量；
- 修改旧渠道 ID，或将新渠道写到已有 ID 上；
- 为方便回滚而覆盖原记录内容。

### 5.2 允许的数据库动作

只允许：

1. 读取现有 schema、渠道行数、版本号和索引；
2. 创建生产数据库的一致性备份；
3. 必要时增加一个可空、带默认兼容行为的扩展字段；
4. 在事务中插入新的企业智能体渠道；
5. 在现有配置版本机制中新增版本记录或更新当前版本指针；
6. 写入不含密钥明文的部署审计记录。

### 5.3 迁移必须满足

- 幂等：重复执行不会产生重复字段、重复渠道或重复版本。
- 向后兼容：旧代码、旧客户端和旧数据仍可工作。
- 可回滚：只撤销本次新增渠道和本次版本指针，不修改旧数据。
- 单事务：渠道新增与配置版本更新要么一起成功，要么一起回滚。
- 禁止通过“建新表 → 拷贝 → 删旧表 → 改名”的方式迁移生产表。
- 不得在迁移过程中改变用户、积分、订单、激活码、任务、知识库或审批表。

## 6. 上线前数据库保护流程

以下步骤必须按顺序执行并保留证据。

### 6.1 确认真实生产库

记录但不要在工单中暴露敏感值：

- 云端项目、环境和服务名称；
- 数据库类型；
- 数据库实例或 SQLite Volume；
- 当前数据库 schema 版本；
- 模型渠道表名及现有总行数；
- 原有渠道 ID 列表与内容摘要；
- 当前 `config_version`；
- 当前 `/api/config/sync` 返回的 provider 数量。

必须确认操作目标不是临时库、空库或新建未挂载 Volume。

### 6.2 创建备份

SQLite：

```bash
sqlite3 /data/accounts.db ".backup '/backup/accounts-before-agent-model-YYYYMMDD-HHMMSS.db'"
sha256sum /data/accounts.db /backup/accounts-before-agent-model-YYYYMMDD-HHMMSS.db
```

PostgreSQL：

```bash
pg_dump --format=custom --no-owner --file=before-agent-model-YYYYMMDD-HHMMSS.dump "$DATABASE_URL"
sha256sum before-agent-model-YYYYMMDD-HHMMSS.dump
```

要求：

- 备份必须写到与生产数据库文件不同的位置或对象存储；
- 备份完成后检查文件非空；
- 记录校验和、时间、数据库版本和关键表行数；
- 在测试环境完成一次恢复演练，确认备份可读；
- 备份未成功时禁止继续发布。

### 6.3 变更前快照

至少记录以下逻辑快照：

```text
original_provider_count
original_provider_ids
original_config_version
users_count
credit_ledger_count
agent_runs_count
```

不存在的业务表记录为“不适用”，不得为了满足清单而新建空表。

## 7. 发布步骤

1. 只读检查当前 schema 和现有配置。
2. 完成生产备份与恢复验证。
3. 在测试/预发布环境执行幂等迁移。
4. 在事务中新增专用 DeepSeek 渠道。
5. 生成新的 `config_version`。
6. 使用测试账号调用 `/api/config/sync`，验证返回“原完整快照 + 新渠道”。
7. 使用一个灰度账号验证企业智能体文本任务。
8. 若声明支持图片，再执行一次真实图片输入验证。
9. 检查通用文案、GEO、视频等原有模型路由未改变。
10. 扩大到全部授权账号。
11. 变更后重新记录关键表行数、渠道 ID 和同步快照摘要。

整个过程不得重新部署或替换数据库 Volume。若云平台更新环境变量 API 采用“全量替换”语义，必须先读取全部现有变量、原样合并新增项，再提交；不得只提交本次新增变量。

## 8. 回滚边界

允许的回滚：

1. 停止向新配置版本分配流量；
2. 将当前配置版本指针恢复到发布前版本；
3. 在事务中停用或删除**本次新增且尚无外键引用**的渠道记录；
4. 保留部署与故障审计。

禁止的回滚：

- 恢复整个旧数据库覆盖现网，除非数据库已经损坏且负责人明确批准灾难恢复；
- 删除原有渠道；
- 清空客户端配置；
- 删除用户数据、积分流水或智能体任务记录；
- 回滚其他同期业务的数据库迁移。

如果新渠道已经被运行记录引用，应将其标记为停用，不得物理删除。

## 9. 安全与日志边界

- API Key 只能存在于现有 Secret/加密字段和授权后的同步响应中。
- 服务端日志不得打印 `api_key`、完整 `providers`、认证 Cookie 或 `MODEL_PROVIDERS_JSON_B64`。
- 管理后台展示密钥时只允许显示掩码。
- `/api/config/sync` 必须沿用现有用户认证和账号状态校验。

### 4.1 开发环境刷新与重启

`pnpm dev:all` 会在进程启动时读取桌面端加密缓存
`%APPDATA%\cuocuo-ai\credentials.bin`，运行中不会热替换
`MODEL_PROVIDERS_JSON_B64`。云端配置版本更新后，开发环境应执行：

```powershell
$env:TEST_LOGIN_NAME="<测试账号>"
$env:TEST_PASSWORD="<测试账号密码>"
pnpm cloud:sync-dev
pnpm dev:all
```

`cloud:sync-dev` 必须满足以下边界：

- 只调用现有登录与 `/api/config/sync` 接口，不直接修改云端数据库；
- 写入新快照前保留旧密文缓存备份；
- 使用临时文件原子替换缓存；
- 日志只输出配置版本与 provider 数量，禁止输出 Key、Cookie 或完整 provider；
- 刷新后必须重启 Next.js 与 FastAPI，确保两个进程使用同一份快照。
- 客户端不能指定 `model`、`provider_id`、`base_url` 或 `api_key`。
- 公开智能体运行响应只返回“服务端路由”和成功调用次数，不返回实际渠道与模型 ID。

## 10. 验收标准

### 10.1 数据库

- [ ] 发布前备份存在、非空、校验和已记录且恢复演练通过。
- [ ] 原数据库文件、实例和 Volume 未替换。
- [ ] 原有渠道数量和内容保持不变，仅增加预期的新渠道。
- [ ] 用户、积分、激活码、任务、知识库和审批数据行数无异常减少。
- [ ] 迁移重复运行不会新增重复记录。
- [ ] 回滚只影响本次新增渠道或版本指针。

### 10.2 同步接口

- [ ] 旧配置版本请求可获得新的完整快照。
- [ ] 当前配置版本请求返回 `unchanged=true`。
- [ ] 响应保留原有全部 `keys` 和 `providers`。
- [ ] 新渠道包含正确的 `purpose`、`performance_tier` 和图片能力字段。
- [ ] 未登录、禁用账号和异常响应不泄漏密钥。
- [ ] 旧客户端能忽略 `extra` 并继续正常工作。

### 10.3 模型调用

- [ ] 企业智能体文本任务只命中 `purpose=enterprise_agent` 的 DeepSeek 快速渠道。
- [ ] 普通 DeepSeek、GPT、Claude、豆包等通用渠道不会被企业智能体使用。
- [ ] 专用渠道不可用时返回明确错误，不发生跨业务静默降级。
- [ ] 会签任务的所有模型调用均遵守同一专用渠道边界。
- [ ] 图片任务只命中真实支持图片的专用 DeepSeek 渠道。
- [ ] 客户端伪造模型 ID 不影响服务端选路。

### 10.4 原业务回归

- [ ] 登录与配置同步正常。
- [ ] 原文案创作模型路由不变。
- [ ] GEO 模型路由不变。
- [ ] 视频模型与 RunningHub 工作流不变。
- [ ] 生图渠道不变。
- [ ] 原用户积分、历史任务和知识库数据可正常读取。

## 11. 完成证据

云端团队交付时必须提供：

1. 变更前后渠道清单对比，密钥全部脱敏；
2. 数据库备份路径、校验和及恢复演练结果；
3. 迁移脚本及幂等执行结果；
4. `/api/config/sync` 新旧版本响应结构对比；
5. 一个文本任务的专用渠道命中证据；
6. 如启用图片能力，一个真实图片任务的命中证据；
7. 原业务回归结果；
8. 回滚演练结果；
9. 变更前后关键表行数对比。

只有“数据库无数据损失、同步返回完整快照、企业智能体只命中专用 DeepSeek 快速渠道、原业务回归通过”四项同时满足，才允许判定云端修改完成。
