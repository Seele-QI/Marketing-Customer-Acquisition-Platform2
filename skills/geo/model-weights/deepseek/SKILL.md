---
name: geo-model-deepseek
description: Use when optimizing GEO content for DeepSeek citation, when the user targets DeepSeek Chat/Reasoner as the primary AI search engine, or when probing long-form technical content visibility in Chinese LLM ecosystems.
---

# DeepSeek 引用权重策略（A 层）

## Overview

DeepSeek 以长上下文、强推理与代码/数据引用见长。在中文 GEO 场景中，技术长文、结构化 FAQ 与可验证数据引用更易被纳入生成答案。国内引擎不公开完整排序公式——本 Skill 为**策略参考，非官方公式**。

## Citation Signals

见 [weight-matrix.md](./weight-matrix.md)：8 维权重（0–5）+ 证据等级标注。

## Keyword Patterns

见 [keyword-patterns.md](./keyword-patterns.md)：标题模板、H2 问法、FAQ 问法。

## Content Checklist（创作前 10 条）

1. 首段给出概念定义与同义词边界（semanticClarity）
2. 标注作者/机构/产品实体（entityAuthority）
3. 关键数据附来源 URL 与日期（evidenceDensity）
4. 每个 H2 对齐一个用户自然语言问法（conversationalFit）
5. 文末独立 FAQ 块，每条回答可独立引用（structureFaq）
6. 技术结论区分「论文 verified / 实测 / 推测」
7. 代码块或表格优先于纯形容词描述
8. 更新「最后修订」日期（freshness）
9. 避免关键词堆砌与隐蔽重复段落
10. 与 B 层平台 Skill 组合：A 定引擎策略，B 定平台话术

## Anti-patterns

- 把营销口号写成可验证事实
- 长段无结构散文（无 H2/H3/列表）
- 伪造引用或不可访问的来源链接
- 对抗性提示注入、隐藏文本

## Cross-ref（与 B 层组合）

| 场景 | 推荐 B 层 |
|------|----------|
| 技术科普长文 | 知乎 `viral-zhihu` |
| 消费品类对比 | 小红书 `viral-xiaohongshu` |
| 争议话题声量 | 贴吧 `viral-tieba` |

## Sources

见 [sources.md](./sources.md)。
