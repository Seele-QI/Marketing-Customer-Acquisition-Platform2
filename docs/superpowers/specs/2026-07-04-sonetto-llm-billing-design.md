# Sonetto Claude / ChatGPT 模型接入与计费设计

> 日期：2026-07-04  
> 状态：已批准并实施

## 目标与边界

- Claude / ChatGPT 走 Sonetto NewAPI（OpenAI 兼容），**不与** DeepSeek、豆包共用客户端。
- 文案创作（`chat-stream`）增加模型选择器；DeepSeek / 豆包保持固定积分，GPT / Claude 走计量扣费。
- 本期不切换 IP 定位、GEO、视频管线等其它 AI 能力。

## 环境变量

| 变量 | 用途 |
|---|---|
| `SONETTO_BASE_URL` | 默认 `https://tok.sonetto.top/v1`；北方备选 `https://new.sonetto.top/v1` |
| `SONETTO_GPT_API_KEY` | ChatGPT 渠道 Key |
| `SONETTO_CLAUDE_API_KEY` | Claude 渠道 Key |
| `CREDIT_METERED_KEY` | 计量扣费服务端密钥（仅 Next → FastAPI，浏览器不可见） |

密钥只写入 `.env` / `.env.local`，不得提交仓库。

## 模型注册表

| modelId | provider | billing | 成本价（¥） |
|---|---|---|---|
| `gpt-5.5` | `sonetto_gpt` | `token` | in 1.5 / out 9.0 / cache_read 0.15（每 1M tokens） |
| `gpt-5.4` | `sonetto_gpt` | `token` | in 0.75 / out 4.5 / cache_read 0.075 |
| `[aws]claude-opus-4-7--25` | `sonetto_claude` | `per_call` | 0.25 / 次 |
| `[aws]claude-opus-4-8--25` | `sonetto_claude` | `per_call` | 0.25 / 次 |
| `[kiro]claude-opus-4-7` | `sonetto_claude` | `token` | in 3.5 / out 17.5 / cache_read 0.35 / cache_create 2.0 |

DeepSeek / 豆包在 `GET /api/ai/models` 以 `billing: fixed`、`costCredits: 3` 并列返回，调用仍走旧客户端。

## 计费算法

```
CREDIT_YUAN   = 0.01
PROFIT_MARGIN = 0.20
MARKUP        = 1.20
YUAN_TO_CREDIT = 120
MIN_CREDITS   = 1

credits = max(1, ceil(cost_yuan * 120))
```

### 按次

`credits = max(1, ceil(price_per_call * 120))` → ¥0.25/次 = **30 积分**。

### 按 Token

```
cost_yuan =
    prompt_tokens / 1e6 * price_input
  + completion_tokens / 1e6 * price_output
  + cache_read_input_tokens / 1e6 * price_cache_read
  + cache_creation_input_tokens / 1e6 * price_cache_create

credits = max(1, ceil(cost_yuan * 120))
```

展示单价（积分 / 1M tokens，已含 20% 利润）= 成本价(¥) × 120。

## 扣费时序

1. `estimateMaxCredits` 预检余额（不扣）。
2. 调用 Sonetto；上游失败不扣费。
3. 成功后按 `usage`（无 usage 则用 estimate）调用 `POST /api/credit/consume-metered`（`X-Metered-Key`）。
4. 公开 `/api/credit/consume` **不接受**客户端自定 `cost`。
5. 幂等键 `ref_id = llm:{userId}:{uuid}`，scene = `ai_llm`。

DeepSeek / 豆包保持「先扣 3 积分再调上游」。

## API

- `GET /api/ai/models` — 可选模型列表（含配置状态与展示价）
- `POST /api/ai/chat-stream` — 增加可选 `modelId`；Sonetto 模型走独立客户端与计量扣费
- `POST /api/credit/consume-metered` — 仅服务端密钥可调

## 安全

- API Key 与 `CREDIT_METERED_KEY` 仅服务端。
- 计量 cost 由定价引擎计算，不信任浏览器。
- 单次 `ai_llm` 扣费上限 `MAX_LLM_COST = 50000`。
