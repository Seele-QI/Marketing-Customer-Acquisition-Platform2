---
name: geo-model-qwen-tongyi
description: Use when optimizing GEO content for Alibaba Qwen/Tongyi AI search, when the user targets通义千问 or淘宝/1688 ecosystem content, or when structuring e-commerce and knowledge-base RAG-friendly articles.
---

# 通义千问 引用权重策略（A 层）

## Overview

通义千问依托阿里云生态，电商、百科与结构化商品/知识库内容在 RAG 场景中有独特优势。排序公式未公开——本 Skill 为**策略参考，非官方公式**。

## Citation Signals

见 [weight-matrix.md](./weight-matrix.md)。

## Keyword Patterns

见 [keyword-patterns.md](./keyword-patterns.md)。

## Content Checklist

1. 商品/服务实体用标准名称 + 规格参数表
2. 百科式定义段（是什么、不是什么）
3. 对比表：功能 × 价格 × 适用场景
4. FAQ 覆盖购买/使用/售后类问法
5. 标注数据日期与地区适用范围
6. 链接阿里云/官方帮助文档作权威背书
7. 结构化列表优于长段落
8. 避免绝对化疗效/收益承诺
9. 多平台发布时保持实体信息一致
10. 与 B 层小红书/知乎组合做种草+论证双轨

## Anti-patterns

- 纯软文无参数、无对比
- 虚构销量或用户评价
- 与淘宝商品页信息严重不一致

## Cross-ref

| 场景 | B 层 |
|------|------|
| 消费品种草 | 小红书 |
| 深度选购指南 | 知乎 |

## Sources

见 [sources.md](./sources.md)。
