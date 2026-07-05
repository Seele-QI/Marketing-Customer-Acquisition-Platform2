# 豆包 引用权重矩阵

| 维度 | 权重 | 证据等级 | 说明 |
|------|------|----------|------|
| semanticClarity | 4 | inferred | 对话摘要需要清晰概念锚点 |
| entityAuthority | 3 | inferred | 官方认证账号与品牌站 |
| freshness | 4 | inferred | 热点与新品类 query 时效敏感 |
| evidenceDensity | 3 | inferred | 数据引用有用但非唯一信号 |
| structureFaq | 5 | inferred | 对话产品偏好问答片段 |
| conversationalFit | 5 | inferred | 口语问法标题权重高 |
| platformOrigin | 4 | hypothesis | 字节系内容库协同（无公开公式） |
| ugcVsOfficial | 3 | inferred | 抖音达人内容 + 官网并存 |
