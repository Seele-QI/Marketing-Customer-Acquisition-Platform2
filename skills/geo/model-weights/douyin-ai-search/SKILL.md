---
name: geo-model-douyin-ai-search
description: Use when optimizing GEO content for Douyin AI Search citation, when the user targets抖音 AI 搜索 or video-plus-text hybrid indexing, or when weighting short-video ecosystem internal links in generative answers.
---

# 抖音 AI 搜索 引用权重策略（A 层）

## Overview

抖音 AI 搜索索引视频、图文与站内生态内容，与「抖音内容爆款」（B 层 `douyin-content`）不同：本 Skill 聚焦 **AI 搜索引用权重**。排序公式未公开——**策略参考，非官方公式**。

## Citation Signals

见 [weight-matrix.md](./weight-matrix.md)。

## Keyword Patterns

见 [keyword-patterns.md](./keyword-patterns.md)。

## Content Checklist

1. 标题含核心搜索词（与视频文案一致）
2. 图文版完整文字稿（ASR 纠错后）
3. 时间戳章节对应视频节点
4. 站内链接与话题标签规范书写
5. 数据结论附来源（非口播空喊）
6. FAQ 覆盖「怎么搜到」「什么意思」
7. 区分 A 层引用策略 vs B 层爆款钩子
8. 更新发布日期
9. 封面与标题语义一致
10. 跨平台分发时保留抖音首发标识

## Anti-patterns

- 只有视频无可索引文字
- 标题与内容搜索意图不符
- 把 B 层爆款套路当作 A 层引用保证

## Cross-ref

- 内容爆款话术 → `platform-viral/douyin-content`
- 字节对话 → `model-weights/doubao`

## Sources

见 [sources.md](./sources.md)。
