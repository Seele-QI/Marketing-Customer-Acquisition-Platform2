# GEO 调研来源总表

> 版本：2026-07-03 | 维护：`/loop` 14d 心跳复查  
> 证据等级：`verified`（论文/官方/可复现）| `inferred`（同行报告+行业共识）| `hypothesis`（待实测）

---

## 调研模板（每平台复用）

| 字段 | 说明 |
|------|------|
| 检索架构 | 联网/RAG、索引来源偏好 |
| 引用信号 | 带证据等级的权重假设 |
| 8 维权重 | semanticClarity / entityAuthority / freshness / evidenceDensity / structureFaq / conversationalFit / platformOrigin / ugcVsOfficial |
| 关键词模式 | 高引用句式、禁用模式 |
| 更新日期 | ISO 日期 |

---

## 学术论文（verified 基线）

| # | 来源 | URL | 摘录要点 | 等级 | 日期 |
|---|------|-----|----------|------|------|
| 1 | GEO: Generative Engine Optimization | https://arxiv.org/abs/2311.09735 | 正式 GEO 框架；GEO-bench 显示优化可达 ~40% 可见性提升 | verified | 2023-11 |
| 2 | C-SEO Bench: Does Conversational SEO Work? | https://arxiv.org/abs/2506.11097 | LLM 搜索下传统 SEO 局限；提出可量化 GEO 指标 | verified | 2025-06 |
| 3 | Adversarial SEO for LLMs | https://arxiv.org/abs/2406.18382 | 对抗性内容可操纵 LLM 搜索引擎；伦理边界 | verified | 2024-06 |
| 4 | Manipulating LLMs for Product Visibility | https://arxiv.org/abs/2404.07981 | 策略性文本序列（STS）可提升 LLM 推荐概率 | verified | 2024-04 |
| 5 | Ranking Manipulation in Conversational Search | https://arxiv.org/abs/2406.03589 | 对话式搜索排名操纵风险与机遇 | verified | 2024-06 |
| 6 | Role-Enhanced Intent-Driven G-SEO | https://arxiv.org/abs/2508.11158 | G-SEO 角色/意图建模；G-Eval 2.0 评估 | verified | 2025-08 |
| 7 | ConflictBank Benchmark | https://arxiv.org/abs/2408.12076 | 知识冲突对 LLM 响应的影响 | verified | 2024-08 |
| 8 | What Evidence Do Language Models Find Convincing? | https://arxiv.org/abs/2402.11782 | 模型偏好何种声明、引用与事实基础 | verified | 2024-02 |
| 9 | Yext: 86% AI Citations from Brand-Managed Sources | https://investors.yext.com/news-events/press-releases/detail/376/yext-research-86-of-ai-citations-come-from-brand-managed | ChatGPT/Gemini/Perplexity 680 万引用中 86% 来自品牌控制域 | verified | 2025-10 |
| 10 | SEJ: AI Search Citation Study | https://www.searchenginejournal.com/ai-search-engines-often-cite-third-party-content-study-finds/540692/ | 第三方内容与品牌提及影响 AI 引用选择 | inferred | 2025-02 |

---

## 行业报告与市场研究

| # | 来源 | URL | 摘录要点 | 等级 | 日期 |
|---|------|-----|----------|------|------|
| 11 | a16z: GEO over SEO | https://a16z.com/geo-over-seo/ | 引用份额成为新 KPI；AI 界面为发现层 | inferred | 2024-09 |
| 12 | Semrush GEO Guide | https://www.semrush.com/blog/generative-engine-optimization/ | ChatGPT/Gemini/Perplexity 摘要出现技巧 | inferred | 2024-12 |
| 13 | Semrush AI Overviews Study | https://www.searchenginejournal.com/semrush-ai-overviews-study/ | <20% AI 概览引用与顶级自然排名重合 | inferred | 2025-10 |
| 14 | Mailchimp GEO Resource | https://mailchimp.com/resources/generative-engine-optimization | 对话语气、结构化标记、数据权威 | inferred | 2025-01 |
| 15 | Writesonic GEO Overview | https://writesonic.com/blog/what-is-generative-engine-optimization-geo | GEO vs SEO 对比与品牌提及追踪 | inferred | 2024-04 |

---

## 同行 GEO 平台（inferred）

| # | 来源 | URL | 摘录要点 | 等级 | 日期 |
|---|------|-----|----------|------|------|
| 16 | Profound | https://tryprofound.com | 企业级回答引擎洞察；多引擎提及追踪 | inferred | 2025 |
| 17 | Otterly.AI | https://otterly.ai | ChatGPT/Perplexity/AI 概览引用与声量份额 | inferred | 2025 |
| 18 | Rankscale.ai | https://rankscale.ai | 排名追踪、竞争差距、可操作优化策略 | inferred | 2025 |
| 19 | Peec AI | https://peec.ai | 按国家对比 ChatGPT/Claude/Gemini/Perplexity 可见度 | inferred | 2025 |
| 20 | AthenaHQ | https://athenahq.ai | 300 万+ AI 回答分析；中端 SaaS GEO 报告 | inferred | 2025 |

---

## 国内引擎官方文档（部分 verified / 部分 inferred）

| # | 来源 | URL | 摘录要点 | 等级 | 日期 |
|---|------|-----|----------|------|------|
| 21 | 火山方舟文档 | https://www.volcengine.com/docs/82379 | 豆包大模型 API、RAG 接入说明 | verified | 2025 |
| 22 | 阿里云通义千问 | https://help.aliyun.com/zh/model-studio/ | 通义搜索、知识库 RAG 能力说明 | verified | 2025 |
| 23 | DeepSeek 官方 | https://www.deepseek.com/ | 长上下文、推理模型能力公开说明 | verified | 2025 |
| 24 | 抖音开放平台 | https://developer.open-douyin.com/ | 抖音生态内容索引与搜索相关开放能力 | inferred | 2025 |

---

## 分平台 Skill 交叉索引

| 平台 | A 层 Skill | B 层 Skill | 专项 sources.md |
|------|-----------|-----------|-----------------|
| 抖音 AI 搜索 | `model-weights/douyin-ai-search/` | `platform-viral/douyin-content/` | 各目录 `sources.md` |
| 豆包 | `model-weights/doubao/` | — | `model-weights/doubao/sources.md` |
| 通义千问 | `model-weights/qwen-tongyi/` | — | `model-weights/qwen-tongyi/sources.md` |
| DeepSeek | `model-weights/deepseek/` | — | `model-weights/deepseek/sources.md` |
| 知乎 | — | `platform-viral/zhihu/` | `platform-viral/zhihu/sources.md` |
| 小红书 | — | `platform-viral/xiaohongshu/` | `platform-viral/xiaohongshu/sources.md` |
| 微博 | — | `platform-viral/weibo/` | `platform-viral/weibo/sources.md` |
| 大众点评 | — | `platform-viral/dianping/` | `platform-viral/dianping/sources.md` |
| 携程 | — | `platform-viral/ctrip/` | `platform-viral/ctrip/sources.md` |
| 网易 | — | `platform-viral/netease/` | `platform-viral/netease/sources.md` |
| 搜狐 | — | `platform-viral/sohu/` | `platform-viral/sohu/sources.md` |
| 贴吧 | — | `platform-viral/tieba/` | `platform-viral/tieba/sources.md` |

---

## 更新日志

| 日期 | 变更 |
|------|------|
| 2026-07-03 | 初版：24 条可追溯来源 + 调研模板 |
