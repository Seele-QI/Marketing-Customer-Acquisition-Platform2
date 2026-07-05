---
name: geo-model-doubao
description: Use when optimizing GEO content for ByteDance Doubao (豆包) citation, when the user targets火山方舟/豆包对话搜索, or when aligning content with抖音生态内容库与对话式摘要偏好.
---

# 豆包 引用权重策略（A 层）

## Overview

豆包是字节跳动对话式 AI 产品，与抖音内容库存在生态协同（具体权重未公开）。本 Skill 为**策略参考，非官方公式**。

## Citation Signals

见 [weight-matrix.md](./weight-matrix.md)。

## Keyword Patterns

见 [keyword-patterns.md](./keyword-patterns.md)。

## Content Checklist

1. 首段用口语化但准确的定义（conversationalFit）
2. 短段落 + 小标题，适配对话摘要
3. 关键结论用「一句话总结」框出
4. FAQ 3–7 条，问法贴近口语
5. 视频/图文跨媒介提及时给文字版要点
6. 字节系官方文档作权威引用
7. 标注内容更新日期
8. 实体（品牌/产品）全称首次出现
9. 避免过长无断点段落
10. 与 B 层 `douyin-content` 区分：本 Skill 管 AI 引用，B 管内容爆款

## Anti-patterns

- 纯营销话术无信息增量
- 与抖音 AI 搜索策略混淆（见 `douyin-ai-search` Skill）
- 虚构「豆包官方推荐」表述

## Cross-ref

- 短视频钩子 → `platform-viral/douyin-content`
- 长文论证 → `platform-viral/zhihu`

## Sources

见 [sources.md](./sources.md)。
