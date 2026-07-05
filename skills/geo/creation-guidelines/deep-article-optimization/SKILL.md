---
name: geo-deep-article-optimization
description: Use when writing or optimizing long-form articles for Generative Engine Optimization (GEO), especially when the user needs multi-platform content research (Zhihu, Tieba, Xiaohongshu), AI visibility probing across ChatGPT/Claude/Gemini/Perplexity, or structured FAQ/Schema output for AI citation.
---

# 深度优化文章创作准则（GEO）

本准则用于把“长文写作”变成 **可检索、可引用、证据可验证** 的 GEO 文章产出过程。

---

## 硬规则：先检索再动笔

- 在写任何“事实性结论 / 数据 / 行业结论”前，先完成最小检索（至少 2 个平台 + 1 组可引用来源）。
- 若用户要求“不用查资料”，必须降级为：
  - 只输出“可验证的写作框架 + 检索清单 + 风险提示”
  - 或明确标注为“假设/经验性观点”，不得伪造数据与来源。

---

## 资讯平台检索协议

见：`platform-retrieval.md`

---

## AI 可见度探测协议

见：`ai-visibility-protocol.md`

---

## 写作清单（四维）

### 1) 语义清晰度

- 概念先定义：同义词、边界、与相邻概念的区分
- H2/H3 结构对齐用户意图与检索 query

### 2) 对话式设计

- 优先使用“用户会问什么”的问答结构，而不是堆砌术语
- 每个关键小节补 1–2 个自然语言问题（可被 AI 引用的问法）

### 3) 证据驱动

- 每个关键结论至少配 1 条可追溯证据（URL + 摘要 + 引用片段）
- 区分：事实 / 观点 / 经验 / 推测（避免把观点写成事实）

### 4) 结构化 FAQ

- 输出 FAQ 段落，且每条回答必须可验证、可引用
- 文章尾部给出建议 JSON-LD 片段（Article + FAQPage）

---

## 输出模板

见：`output-template.md`

---

## A+B+C 知识库组合工作流

深度优化文章创作页通过 **GeoSkillToolbar** 选择三轨知识库：

| 层级 | 含义 | 存储键 | 选择方式 |
|------|------|--------|----------|
| **A** | 大模型引用权重 | `geo-article-model-skill` | 单选 |
| **B** | 平台爆款逻辑 | `geo-article-viral-skills` | 多选 |
| **C** | 企业知识库 | `geo-article-enterprise-skill` | 单选（localStorage 生成） |

### 推荐流程

1. **选 A**：确定目标 AI 引擎（DeepSeek / 通义 / 豆包 / 抖音 AI 搜索）的引用权重策略 → 读 `skills/geo/model-weights/{platform}/`
2. **选 B**：确定资讯平台话术（知乎 / 小红书 / 贴吧 / 抖音内容）→ 读 `skills/geo/platform-viral/{platform}/`
3. **选 C**（可选）：加载企业知识库搭建页生成的 Skill → `localStorage` `geo-enterprise-skills-v1`
4. **检索**：`GeoResearchPanel` 按 B 选中平台拉参考
5. **起草**：A 的 checklist + weight-matrix + B 的 viral-patterns + C 的品牌实体/FAQ
6. **探测**：`POST /api/geo/ai-probe`
7. **输出**：FAQ + Schema（本准则四维清单）

> A 层权重为**策略参考，非官方公式**；B 层体验观点须与可验证事实分离。

---

## 伦理边界（必须遵守）

- 禁止洗稿/抄袭：不能把小红书/知乎等内容“拼接成稿”伪装为原创论证。
- 禁止对抗性 GEO：不得通过虚假数据、隐蔽文本、对抗性提示注入误导模型与读者。

