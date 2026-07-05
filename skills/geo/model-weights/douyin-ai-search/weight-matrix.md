# 抖音 AI 搜索 引用权重矩阵

| 维度 | 权重 | 证据等级 | 说明 |
|------|------|----------|------|
| semanticClarity | 3 | hypothesis | 短视频语义依赖标题+字幕 |
| entityAuthority | 3 | inferred | 蓝 V、官方号权重较高 |
| freshness | 5 | inferred | 热点搜索极强时效 |
| evidenceDensity | 2 | hypothesis | 娱乐类低；教程/评测类较高 |
| structureFaq | 3 | inferred | 搜索摘要偏短答 |
| conversationalFit | 4 | inferred | 口语搜索词匹配 |
| platformOrigin | 5 | hypothesis | 抖音站内内容优先（无公开公式） |
| ugcVsOfficial | 4 | inferred | UGC 占主导；官方号更可信 |
