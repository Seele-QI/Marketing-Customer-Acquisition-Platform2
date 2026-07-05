# GEO 调研动态循环（/loop）

> 心跳：**14 天** | 事件唤醒：sources 文件变更

---

## Loop Prompt 模板

```
检查 skills/geo/research/SOURCES.md 与各 model-weights/*/sources.md、platform-viral/*/sources.md：
1. 补充 7 日内新论文、同行报告、官方文档
2. 标注证据等级（verified | inferred | hypothesis）
3. 仅更新有变化的 weight-matrix / viral-patterns 条目
4. 在 SOURCES.md 更新日志追加一行
5. 将 hypothesis→inferred 升级项记录在对应 Skill 的 sources.md
```

---

## 触发条件

| 类型 | 条件 | 动作 |
|------|------|------|
| **事件** | `research/SOURCES.md` 或任一 `sources.md` git 变更 | 复查关联 Skill |
| **心跳** | 距上次 loop ≥ 14d | 全量扫描 arxiv + Otterly/Profound/Rankscale 博客 |
| **手动** | 用户 `/loop geo-research` | 执行上述 prompt |

---

## 优先级

1. DeepSeek（论文基线最多）
2. 通义千问（阿里云文档）
3. 豆包 / 抖音 AI 搜索（字节系）
4. B 层平台爆款（随检索 API 反馈调整）

---

## 首次执行记录

| 日期 | 动作 | 结果 |
|------|------|------|
| 2026-07-03 | Phase 1 调研骨架 + 24 条 SOURCES.md | 完成 |
| 2026-07-03 | 4×A + 4×B Skill 初稿 | 完成 |
| 2026-07-17 | 下次心跳（计划） | 待执行 |

---

## 不负责

- 自动修改 registry.json（需人工审核新 Skill ID）
- 调用付费 GEO 平台 API（Profound/Otterly 等仅作手工摘录）
