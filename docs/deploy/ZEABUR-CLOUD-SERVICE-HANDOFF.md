# Zeabur 云服务改造与安全发布交接需求

> 文档用途：交给具备 Zeabur 项目、服务、镜像仓库和生产日志上下文的实施 AI。
>
> 本文是需求和执行边界，不代表已经完成线上发布。执行者必须先核查 Zeabur 当前状态，再做任何外部变更。

## 1. 总目标

在不丢失现有用户、积分、会话、兑换码和模型配置的前提下，完成以下工作：

1. 将本地已经完成的云端计费修复安全发布到现有 Zeabur 服务。
2. 补齐最新“图片工作台”的 `image_creation` 云端计费项目。
3. 建立可重复、可审计、可回滚的 Zeabur 发布流程。
4. 后续建设云端功能目录、模型路由、计费目录和用户业务数据中心，使模型与价格可以通过后台调整，而不是持续修改代码。

## 2. 仓库与职责边界

### 2.1 主程序

- 路径：`F:\A-xiangmu\21-zhongtai\zhongtai-main`
- 职责：Next.js 用户界面、Electron 桌面端、FastAPI 业务执行、RunningHub 图片/视频任务、GEO、智能体和本地任务缓存。
- 它不是独立云端控制中心，但会调用云端认证、积分和模型配置接口。

### 2.2 云端控制服务

- 路径：`F:\A-xiangmu\21-zhongtai\zhongtai-cloud`
- 职责：账号、会话、积分、兑换码、云端固定/动态计费、模型配置同步、桌面端更新清单和管理后台。
- 本次 Zeabur 发布的主要源码真源是该目录。

### 2.3 无效目录

- `F:\A-xiangmu\21-zhongtai\zhongtai-main-beijing-dockers` 当前为空，不能作为发布源码或配置真源。

## 3. 当前线上线索

本地安全部署脚本记录的北京环境如下，但执行前必须通过 Zeabur 只读查询重新确认，禁止直接信任旧 ID：

| 项目 | 当前本地记录 |
|---|---|
| API 公网地址 | `https://mcap-cloud-api.preview.aliyun-zeabur.cn` |
| Web 公网地址 | `https://mcap-cloud-web.preview.aliyun-zeabur.cn` |
| 环境 ID | `6a55b49671e4f22eed327822` |
| API service ID | `6a55b4970d3aedb1dbcf8122` |
| Web service ID | `6a55b4970d3aedb1dbcf8121` |
| API 健康检查 | `GET /health`，应包含 `zhongtai-cloud-api` |
| 生产数据库 | Zeabur Volume `/data/accounts.db` |

执行者必须首先确认 API 和 Web 分别属于 Docker、Git 还是源码上传服务。只有 Docker 服务能够通过 image tag 换版；Git/源码服务只能在原 service ID 上执行常规 redeploy。

## 4. 当前本地状态

### 4.1 已完成但尚未上线的修复

`zhongtai-cloud` 本地已经完成：

- `poster_image = 20` 固定计费。
- `video.dh_economy_segment`：250 积分/20 秒段。
- `video.dh_economy_retry`：250 积分/段。
- 多段任务失败时，按照原始消费流水全额退款，不再只退一个基础单价。
- 旧 `deploy-slim-cloud.mjs` 不再自动挂载 Volume 或覆盖 `/data/accounts.db`，改为转交安全部署入口。
- 缺少 `/data` 时，安全部署脚本必须失败退出。
- API 监听端口在 `zeabur.json` 中对齐为 `8080`。
- 数据库备份、Base64 备份、临时部署产物和 Python 缓存加入 Git 忽略。
- 已增加云端计费、退款、部署安全和主程序/云端一致性测试。

以上修改只在本地，不能视为线上已经生效。

### 4.2 最新阻断项：`image_creation` 仍未加入云端

主程序已升级为“图片工作台”，包含两个独立分区：

| 分区 | 云端 scene | 价格 | 当前主程序 | 当前本地云端 |
|---|---|---:|---:|---:|
| 海报图创作 | `poster_image` | 20 | 已有 | 已有，未上线 |
| 图片创作 | `image_creation` | 20 | 已有 | **缺失** |

所以发布前必须先在 `zhongtai-cloud/api/app/lib/api_auth.py` 的 `SCENE_COST_TABLE` 加入：

```python
"image_creation": 20,
```

并补充以下测试：

- `image_creation` 固定价格为 20。
- 客户端不能传入其他金额绕过云端定价。
- 同一 `ref_id` 重试不会重复扣费。
- 失败退款为 20。
- 主程序与云端的 `poster_image`、`image_creation`、经济型数字人计费合同一致。

这是本次上线前阻断项，不得先部署旧版本再补。

### 4.3 工作区风险

`zhongtai-cloud` 和 `zhongtai-main` 都存在大量既有未提交修改及未跟踪文件。执行者必须：

- 不使用 `git reset --hard`、`git checkout --` 或其他覆盖用户改动的命令。
- 不把整个脏工作目录直接作为发布包。
- 只选择本需求涉及的文件组成可审计发布版本。
- 不提交 `.backup-*`、`*.db`、`*.db.b64`、`.tmp-*`、`scripts/tmp-*`、`__pycache__`、`.pyc`。
- 对本需求以外的已有修改不清理、不改写、不声称属于本次交付。

## 5. 图片工作台云端合同

### 5.1 业务接口

- 新通用接口：
  - `POST /api/image-workbench/generate`
  - `GET /api/image-workbench/status`
- 旧兼容接口：
  - `POST /api/poster/generate`
  - `GET /api/poster/status`
- 旧接口暂时保留，不能在本次云端发布中删除。

### 5.2 模型与密钥

- 海报图创作和图片创作均使用 RunningHub G-2 管线。
- 复用现有 `RUNNINGHUB_API_KEY`。
- 不新增环境变量。
- RunningHub 图片工作流不属于纯 LLM 模型同步配置，不能因为建设模型配置中心而覆盖或删除现有 RunningHub 配置。

### 5.3 计费语义

- 用户确认一次生成操作，只扣费一次。
- 一次生成固定产生两张候选图，不按候选图数量重复扣费。
- 参数校验成功后、FastAPI 创建 RunningHub 任务前扣费。
- `ref_id` 必须唯一并支持幂等。
- 未知场景应返回明确的“计费项目未配置”，不能伪装成余额不足。
- 云端不可用应返回“计费服务暂时不可用”。
- RunningHub 任务创建失败或最终失败时，应按原始消费流水退款。

## 6. 当前计费合同基线

### 6.1 固定/占位 scene

以下是当前主程序计费表，发布后的云端必须至少保持一致：

| scene | 当前积分 |
|---|---:|
| `ai_chat` | 3 |
| `ai_rewrite` | 3 |
| `ai_ip_positioning` | 20 |
| `ai_ark_image` | 20 |
| `poster_image` | 20 |
| `image_creation` | 20 |
| `ai_llm` | 1，占位，真实金额由受控调用传入 |
| `copywriting_llm` | 2，占位，实际为 2/15 |
| `geo_article` | 10，占位，实际为 10/30 |
| `geo_matrix_gen` | 25 |
| `geo_skill_gen` | 25 |
| `geo_research` | 5 |
| `geo_authority_link` | 5 |
| `dh_v2_plan_script` | 20 |
| `dh_v2_video_segment` | 450/段 |
| `dh_v2_video_retry` | 450/段 |
| `dh_economy_video_segment` | 250/段 |
| `dh_economy_video_retry` | 250/段 |
| `promo_video_segment` | 450/段 |
| `promo_storyboard` | 50 |
| `video_creation` | 250/段 |
| `video_image_to_video` | 40 |
| `video_mashup` | 50 |
| `video_clone_voice` | 10 |
| `copy_extract` | 5 |

### 6.2 动态 billing key

| billing key | 规则 |
|---|---|
| `copywriting.llm_call` | 经济模型 2，高级模型 15 |
| `geo.article` | 经济模型 10，高级模型 30 |
| `video.dh_v2_segment` | 450 × 段数 |
| `video.dh_v2_retry` | 450 |
| `video.dh_economy_segment` | 250 × 段数 |
| `video.dh_economy_retry` | 250 |
| `video.promo_segment` | 每 15 秒一段，默认 450/段 |

客户端只提交 `scene` 或 `billing_key + params`；最终金额必须由云端解析和校验，不能信任客户端传入的任意 cost。

## 7. 数据安全红线

### 7.1 绝对禁止

- 删除 Zeabur 服务后重建。
- 使用 `deployTemplate` 代替版本切换。
- 新建服务并挂载空 Volume 代替旧服务。
- AI 创建、挂载、分离、卸载、调整或删除 Volume。
- 对 `/data` 或其父目录执行递归删除。
- 覆盖、替换或写回 `/data/accounts.db`。
- 使用本地 `.backup-beijing-accounts.db` 自动覆盖生产数据库。
- 执行 `DROP DATABASE`、`DROP TABLE`、`TRUNCATE`。
- 通过整表 Map 更新环境变量而清空未包含的变量。
- 在日志、提交或交接文档中输出 API Key、管理员密钥、数据库内容或会话令牌。

### 7.2 允许

- Docker 服务更新 image tag。
- 在原 Git/源码 service ID 上常规 redeploy。
- 单项更新环境变量。
- 常规重启。
- SQLite 在线 `.backup`。
- 只读检查数据库表、行数、文件大小、挂载状态和环境变量 key 名。
- 幂等、向后兼容、可回滚的加表或可空字段迁移。

## 8. 标准实施流程

### 阶段 A：只读预检

1. 列出 Zeabur 项目、环境、API/Web 服务 ID 和服务类型。
2. 确认目标仍是北京现有服务，不使用香港或历史服务。
3. 确认 API `/data` Volume 已挂载。
4. 确认 `CREDIT_DB_OVERRIDE=/data/accounts.db`，只显示变量名和必要的非敏感路径，不输出密钥值。
5. 记录当前镜像/tag 或源码部署版本。
6. 调用 `/health`、`/api/central/manifest` 和受保护路由探针，建立上线前基线。
7. 只读记录：
   - `users` 行数；
   - `credit_accounts` 行数及积分总额；
   - `credit_ledger` 行数；
   - `sessions` 行数；
   - `credit_redeem_codes` 行数；
   - `model_provider_configs` 行数；
   - `/data/accounts.db` 文件大小。

### 阶段 B：备份

1. 使用 SQLite 在线 `.backup` 生成带时间戳备份。
2. 备份保存在安全位置或加密对象存储，不能覆盖生产文件。
3. 验证备份可以只读打开并通过 `PRAGMA integrity_check`。
4. 记录备份大小、SHA-256 和时间，不在日志中输出业务数据。

### 阶段 C：形成可追溯发布版本

1. 先补齐 `image_creation = 20` 和对应测试。
2. 复核以下发布范围：
   - `api/app/lib/api_auth.py`
   - `api/app/lib/credit.py`
   - `api/app/lib/credit_pricing.py`
   - `api/tests/test_phase1_billing_contract.py`
   - `api/tests/test_phase1_deploy_safety.py`
   - `.gitignore`
   - `scripts/deploy-beijing-config-center.mjs`
   - `scripts/deploy-slim-cloud.mjs`
   - `docs/deploy/ZEABUR.md`
   - `zeabur.json`
3. 审查上述文件与现有业务改动是否重叠，不能覆盖其他开发者内容。
4. 运行全部云端 API 测试、主程序计费测试、脚本语法检查和差异检查。
5. 形成不可变版本号和变更清单。

### 阶段 D：发布

#### Docker 服务

1. 构建并推送不可变镜像 tag，禁止只使用 `latest` 作为唯一版本证据。
2. 记录旧 tag。
3. 仅更新原服务 image tag：

```bash
npx zeabur@latest service update tag --id <service-id> -t <new-tag> -y -i=false
```

4. Zeabur 使用新镜像重启，原 Volume 保持挂载。

#### Git/源码服务

1. 不尝试修改不存在的 image tag。
2. 只允许对原 service ID 常规 redeploy。
3. 部署工具必须先确认 `/data` 已存在；不存在就失败退出，不能自动挂载。
4. 本次 API 改动优先只发布 API；Web 没有变更时不要无意义重发 Web。

### 阶段 E：上线后验收

1. `/health` 正常。
2. 数据库路径、Volume 挂载和文件大小合理。
3. 上线前后用户、积分账户、流水、会话、兑换码和模型配置数量不减少。
4. 旧用户可以登录并读取原余额。
5. `/api/config/sync` 仍返回完整 `keys + providers` 快照，不能只返回新增项。
6. 管理后台用户、积分和模型配置页面正常。
7. 真实小额验证：
   - `poster_image` 一次扣 20；
   - `image_creation` 一次扣 20；
   - 同一 `ref_id` 重放不重复扣费；
   - 经济型数字人 2 段扣 500；
   - 模拟失败按原流水全额退款。
8. 真实 RunningHub 验证至少覆盖一次图片工作台任务；只有真实返回图片才算外部端到端成功。

### 阶段 F：失败回滚

- Docker 服务：恢复旧 image tag。
- Git/源码服务：恢复上一份已验证源码版本到原 service ID。
- 回滚代码不能回滚或覆盖数据库文件。
- 不得通过删除服务、新建服务或恢复旧数据库文件来回滚应用版本。
- 回滚后重新执行数据对账和健康检查。

## 9. 第一阶段验收门槛

以下条件全部满足才可声明第一阶段线上完成：

- [ ] 已确认 Zeabur 服务类型和原 service ID。
- [ ] 已确认 `/data` Volume 和数据库路径。
- [ ] 已生成并验证只读备份。
- [ ] `poster_image` 和 `image_creation` 均为 20。
- [ ] 两种经济型数字人 billing key 可用。
- [ ] 多段退款按照原始流水金额。
- [ ] 主程序/云端计费一致性测试通过。
- [ ] 部署脚本不包含挂载 Volume、覆盖数据库或删除服务逻辑。
- [ ] 发布使用原服务更新，未创建替代服务。
- [ ] 上线前后数据对账无减少。
- [ ] 登录、余额、模型同步和管理后台正常。
- [ ] 真实图片任务和真实扣费验证成功。
- [ ] 已记录新旧版本及回滚方式。

本地测试、代码提交、容器启动或接口返回 queued，均不能代替真实云端验收。

## 10. 第二阶段：可运营云端控制中心

第一阶段稳定后，建设以下后台模块。

### 10.1 功能目录

建立稳定功能代码，例如：

- `image.poster.generate`
- `image.general.generate`
- `video.dh.economy.segment`
- `video.dh.premium.segment`
- `geo.article.generate`
- `agent.chat`

模型路由、价格、权限和统计都绑定功能代码，不再散落在页面和代码常量中。

### 10.2 模型与供应商中心

支持 LLM、图片、视频、RunningHub 工作流、搜索和 ASR：

- URL、加密 API Key、模型/工作流 ID；
- 能力标签；
- 启停、优先级、健康检查；
- 主备路由、超时、重试、灰度和回滚；
- 按功能绑定模型，而不是全局共享一个排序池。

供应商长期密钥不应最终下发给前端；长期目标是云端模型网关或短期作用域令牌。

### 10.3 计费中心

将价格从代码常量迁移为云端版本化目录：

- 固定价、按次数、按段数、按时长、按 Token；
- 会员价、套餐价；
- 生效时间、价格版本和回滚；
- 失败退款规则；
- 每笔流水记录 `billing_item`、`price_version`、路由版本、实际模型和请求 ID。

客户端只提交业务动作和参数，金额由云端计算。

### 10.4 用户数据中心

云端权威保存：

- 用户资料、套餐、权限；
- 身份定位档案和用户记忆；
- 项目、计划、对话和智能体运行记录；
- GEO 内容、图片/视频任务元数据和生成历史；
- 积分、订单、退款和审计事件。

大文件进入 OSS，数据库只保存元数据和对象引用。浏览器 Cookie、平台登录状态等高敏感凭据默认留在本机，若需云同步必须进入独立加密保险库。

### 10.5 建议基础设施

短期保持模块化单体，避免过早拆微服务：

- 云端管理 Web；
- 云端控制 API；
- 业务执行 API/Worker；
- 当前 SQLite Volume 继续作为第一阶段生产真源。

业务增长后再迁移：

- PostgreSQL：用户、计费、配置和业务元数据；
- Redis：任务队列、锁、缓存和限流；
- OSS：图片、视频、附件和备份；
- KMS/Secret Manager：供应商密钥；
- Worker：图片、视频和长任务。

数据库迁移必须增量、幂等、向后兼容、可回滚，禁止通过替换 Volume 或数据库文件完成迁移。

### 10.6 全项目云端配置清单

实施第二阶段配置中心前，必须全局核对以下变量的读取位置、部署范围和是否允许下发客户端。不得因为名称相似而合并不同业务端点。

| 类别 | 配置项 |
|---|---|
| 云端连接 | `CLOUD_API_URL`、`FASTAPI_URL`、`NEXT_PUBLIC_FASTAPI_URL`、`NEXT_PUBLIC_CLOUD_API_URL` |
| 数据库与配置加密 | `CREDIT_DB_OVERRIDE`、`CONFIG_ENCRYPTION_KEY`、`CONFIG_KEY_POOL_JSON_B64`、`CONFIG_VERSION` |
| 认证与积分 | `EMAIL_HASH_SALT`、`CREDIT_REGISTER_BONUS`、`CREDIT_SESSION_TTL_DAYS`、`CREDIT_EMAIL_TOKEN_TTL_SECONDS`、`CREDIT_ADMIN_ACCESS_KEY`、`CREDIT_METERED_KEY` |
| 管理员 | `ADMIN_LOGIN_NAME`、`ADMIN_PASSWORD_HASH`、`ADMIN_PASSWORD_SALT` |
| 邮件 | `RESEND_API_KEY`、`RESEND_FROM`、`APP_PUBLIC_BASE`、`DEV_EMAIL_MODE` |
| 短信 | `ALIYUN_ACCESS_KEY_ID`、`ALIYUN_ACCESS_KEY_SECRET`、`ALIYUN_SMS_SIGN_NAME`、`ALIYUN_SMS_TEMPLATE_CODE`、`ALIYUN_SMS_TEMPLATE_PARAM_KEY`、`ALIYUN_SMS_REGION_ID`、`DEV_SMS_MODE` |
| DeepSeek | `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_CHAT_MODEL`、`DEEPSEEK_VISION_MODEL` |
| NewAPI | `NEWAPI_ENABLED`、各级 `NEWAPI_*_BASE_URL`、`NEWAPI_*_KEY`、`NEWAPI_*_GPT_MODEL`、`NEWAPI_*_CLAUDE_MODEL` 及兼容 `SONETTO_*` |
| 火山方舟 | `ARK_API_KEY`、`ARK_BASE_URL`、`ARK_CHAT_MODEL`、`ARK_ENDPOINT_ID`、`ARK_IMAGE_API_KEY`、`ARK_IMAGE_ENDPOINT_ID` |
| 身份定位 | `POSITIONING_PRODUCT_ARK_ENDPOINT_ID`、`POSITIONING_PRODUCT_ARK_API_KEY` |
| RunningHub | `RUNNINGHUB_API_KEY`、`RH_VIDEO_INSTANCE_TYPE`、`PROMO_VIDEO_POLL_TIMEOUT` |
| Seedance/星河 | 各级 `SEEDANCE_*_BASE_URL`、`SEEDANCE_*_API_KEY`、`SEEDANCE_*_MODEL`、`SEEDANCE_*_MEDIA_MODE`、`XINGHE_*` |
| 数字人运行参数 | `DH_VIDEO_V2_DEFAULT_PROVIDER`、`DH_V2_MAX_PARALLEL_SEGMENTS`、`DH_V2_SEGMENT_POLL_TIMEOUT`、`DH_V2_TASK_TIMEOUT`、`DH_V2_PLAN_PROVIDER_TIMEOUT_MS`、`DH_V2_PLAN_TOTAL_TIMEOUT_MS` |
| 其他模型 | `KIMI_API_KEY`、`KIMI_MODEL`、`GEMINI_API_KEY`、`GEMINI_CHAT_MODEL`、`OPENAI_*`、`ANTHROPIC_*`、`ZHILING_API_KEY` |
| 搜索与 ASR | `TIANAPI_KEY`、`JUSTONEAPI_TOKEN`、`SERPAPI_KEY`、`ALIYUN_ASR_APP_KEY` |
| 文件与视频 | `DATA_DIR`、`VIDEO_BGM_DIR`、`VIDEO_POSTPROCESS_DIR`、`FFMPEG_MAX_CONCURRENT` |
| 自动发布 | `COOKIE_ENCRYPTION_KEY`、`PLAYWRIGHT_BROWSERS_PATH`、`PUBLISH_TIMEOUT_S`、`SHARE_BASE_URL`、`SHARE_API_TOKEN` |
| OSS 与更新 | `OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`、`OSS_REGION`、`OSS_PREFIX`、`UPDATE_FEED_URL`、`CENTRAL_*` |
| 网络部署 | `CORS_ALLOW_ORIGINS`、`PORT`、`HOST`、`NODE_ENV` |

配置管理必须区分：

1. **控制面专用密钥**：数据库、管理员、邮件、短信、OSS 等，只能保留在 Zeabur 服务端。
2. **模型供应商配置**：适合进入加密供应商表和路由策略，但长期不应把长期 API Key 下发浏览器。
3. **业务工作流配置**：RunningHub 图片/视频工作流和模型 ID，必须按功能独立管理，不能混入纯 LLM 供应商池后被覆盖。
4. **运行时参数**：并发、超时、目录、端口等属于部署配置，不属于运营人员选择模型的页面。

当前 `/api/config/sync` 必须继续返回完整 `keys + providers` 快照。新增渠道时要合并原有配置，不能用仅含新增项的快照覆盖客户端已有配置。

## 11. 交付证据要求

实施 AI 最终必须交付：

1. Zeabur 服务类型、原 service ID、更新前后版本。
2. Volume 和数据库路径的只读检查证据。
3. 备份时间、大小、SHA-256 和完整性检查结果。
4. 本次实际发布文件清单。
5. 测试命令及完整通过数量。
6. 更新前后数据对账表。
7. 健康检查、登录、余额、模型同步和管理后台证据。
8. `poster_image`、`image_creation`、幂等扣费和全额退款证据。
9. 真实 RunningHub 图片生成证据。
10. 回滚版本和回滚命令。

不得将“代码已修改”“本地测试通过”“容器启动”“任务已排队”描述为线上发布或真实业务验收完成。

## 12. 相关文件

- `zhongtai-main/docs/deploy/CLOUD-CONTROL-PLANE-ARCHITECTURE.md` — **云端控制面顶层架构**（职责、板块、配置分类、演进）
- `zhongtai-main/AGENTS.md`
- `zhongtai-main/docs/superpowers/specs/2026-07-27-image-workbench-design.md`
- `zhongtai-main/docs/superpowers/plans/2026-07-27-image-workbench.md`
- `zhongtai-cloud/docs/deploy/ZEABUR.md`
- `zhongtai-cloud/contracts/CONFIG_KEYS.md`
- `zhongtai-cloud/api/app/lib/api_auth.py`
- `zhongtai-cloud/api/app/lib/credit_pricing.py`
- `zhongtai-cloud/api/app/lib/credit.py`
- `zhongtai-cloud/scripts/deploy-beijing-config-center.mjs`
- `zhongtai-cloud/api/tests/test_phase1_billing_contract.py`
- `zhongtai-cloud/api/tests/test_phase1_deploy_safety.py`
