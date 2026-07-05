# DeepSeek 引用权重矩阵

> 策略参考，非官方公式。权重 0（低）– 5（高）。

| 维度 | 权重 | 证据等级 | 说明 |
|------|------|----------|------|
| semanticClarity | 5 | verified | 论文 2311.09735：语义清晰内容 GEO 提升显著；DeepSeek 长文推理依赖明确概念边界 |
| entityAuthority | 4 | inferred | 技术社区实测：官方文档、知名机构署名更易被引用 |
| freshness | 3 | inferred | 联网检索时新内容有优势；纯训练知识域内时效性权重中等 |
| evidenceDensity | 5 | verified | arxiv:2402.11782：模型偏好可验证证据与数据引用 |
| structureFaq | 4 | verified | FAQ/问答结构利于片段抽取与引用 |
| conversationalFit | 4 | inferred | 对话式问法标题与 H2 对齐用户 prompt |
| platformOrigin | 2 | hypothesis | 未见公开「平台来源偏好」文档；第三方技术站与官网均可见 |
| ugcVsOfficial | 3 | inferred | 官方文档权重高，但高质量 UGC（知乎专栏等）亦可被索引 |

## 组合建议

- **技术决策类**：semanticClarity + evidenceDensity 优先拉满
- **品牌认知类**：entityAuthority + structureFaq 优先
