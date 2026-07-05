# GEO 文章输出模板（长文）

> 用于生成可检索、可引用的长文与结构化 FAQ/Schema 片段。

---

```markdown
# {标题} — 语义清晰的 H1

> TL;DR：用 2–4 句给出结论与适用场景（避免无来源数据）。

## 1. {核心概念}
{定义 + 背景 + 与相邻概念区分 + 术语同义词}

## 2. {工作流/方法论}
- 步骤 1 …
- 步骤 2 …

## 3. 证据与来源（可验证）
- 数据点 1（带来源 URL 与摘录）
- 数据点 2（带来源 URL 与摘录）

## 4. 适用场景与不适用场景
- 适用：…
- 不适用：…

## 常见问题（FAQ）
### Q: {自然语言问题}？
A: {简明、可验证的回答 + 必要时给出来源}

---

## 建议 Schema 片段（JSON-LD）

### Article
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "{标题}",
  "author": { "@type": "Organization", "name": "{品牌/团队}" },
  "datePublished": "{YYYY-MM-DD}"
}
```

### FAQPage（可选）
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "{问题}",
      "acceptedAnswer": { "@type": "Answer", "text": "{回答}" }
    }
  ]
}
```
```

