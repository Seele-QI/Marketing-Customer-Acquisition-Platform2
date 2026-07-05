---
name: geo-content-matrix-planning
description: Use when planning multi-platform 2-week GEO content matrix with cross-platform theme arcs, platform-native rewrites, and evidence/experience separation for AI visibility.
---

# 内容矩阵规划准则（GEO）

本准则用于把「多平台两周内容日历」变成 **跨平台主题关联、平台原生改写、可被 AI 检索引用** 的 GEO 矩阵产出。

---

## 硬规则

1. **跨平台主题关联**：14 天内至少 1 条贯穿叙事弧（`themeArc`），各平台在同一弧上差异化表达，不得各写各的无关主题。
2. **平台原生改写**：同一主题在不同平台必须调整格式、语气、钩子与篇幅；禁止一字不差多平台粘贴。
3. **证据与体验分离**：事实/数据/对比类内容须有可追溯依据；体验/观点类须标注为经验性表述，不得伪造数据。
4. **GEO 意图对齐**：每条内容须标明 `geoIntent`（对比/教程/FAQ/种草/攻略等），并与目标 AI 引擎问法对齐。
5. **两周 Sprint 结构**：W1 立题与认知建立 → W2 深化、对比与转化；见 `two-week-sprint-template.md`。

---

## 配套文档

| 文件 | 用途 |
|------|------|
| `two-week-sprint-template.md` | 14 天表格字段定义 |
| `platform-playbooks.md` | 8 平台玩法摘要 |
| `cross-platform-coherence.md` | 跨平台叙事弧与差异化 |
| `sources.md` | 可追溯来源 |

---

## 输出契约（AI 生成）

生成 API 要求模型输出 JSON（非 Markdown），结构见 `lib/geo/matrix-types.ts`：

- 每选中平台一组 `PlatformMatrix`
- 每平台 **恰好 14 个内容位**（一日一格，覆盖两周）
- 每格含：`date`、`week`、`themeArc`、`title`、`contentDirection`、`format`、`geoIntent`、`platformNative`

---

## A+B+C 知识库组合

| 层级 | 用途 |
|------|------|
| **A** | 大模型引用权重 → 影响 `geoIntent` 与 FAQ/对比结构 |
| **B** | 平台爆款逻辑 → 影响 `platformNative` 与标题钩子 |
| **C** | 企业知识库 → 品牌实体、产品、FAQ 注入主题与创作方向 |
