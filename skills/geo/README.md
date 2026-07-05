# GEO Skills（分类索引）

本目录用于集中存放 **GEO（Generative Engine Optimization）相关技能**，以「可扩展分类 + 可注册」的方式供 UI 与 Agent 使用。

---

## 分类约定

| 目录 | 层级 | 说明 |
|------|------|------|
| `model-weights/` | **A** | 大模型检索/引用权重策略（抖音 AI 搜索、豆包、通义千问、DeepSeek） |
| `platform-viral/` | **B** | 资讯平台爆款逻辑（小红书、抖音、微博、大众点评、知乎、携程、网易、搜狐 + 贴吧） |
| `creation-guidelines/` | — | 创作准则类（深度写作规范、FAQ/Schema 输出等） |
| `research/` | — | 调研总表、/loop 持续更新 |
| `publishing/` | 预留 | 多平台推送一致性、元数据策略 |
| `enterprise-knowledge/` | **C** | 用户生成的企业知识库 Skill（运行时存 localStorage，可选未来导出到此目录） |

### A vs B 区分（抖音）

- **A** `model-weights/douyin-ai-search` — 抖音 **AI 搜索**引用权重
- **B** `platform-viral/douyin-content` — 抖音 **内容爆款**文案与钩子

### C 层（企业知识库）

- **来源**：企业知识库搭建页 → 实体 + 文档 → 大模型生成 SKILL.md
- **存储**：浏览器 `localStorage`（`geo-enterprise-skills-v1`），**不写入** `registry.json`
- **选用**：`GeoSkillToolbar` C 层下拉；localStorage `geo-article-enterprise-skill`
- **可选导出**：未来可保存到 `enterprise-knowledge/custom/` 并手动注册

---

## 注册表（供 UI 使用）

技能注册表在 `skills/geo/registry.json`。

- **新增静态技能**：在对应分类下新增目录与 `SKILL.md`，并把条目追加到 `registry.json`
- **path 字段**：相对 `skills/geo/` 的路径
- **layer 字段**：`A`（model-weights）、`B`（platform-viral）或 `C`（enterprise-knowledge，仅运行时）

运行时 C 层合并见 `lib/geo/skills-registry.ts` → `listEnterpriseSkills()`。

---

## 已收录技能

### A 层（model-weights）

- `model-deepseek` — DeepSeek 引用权重
- `model-qwen-tongyi` — 通义千问引用权重
- `model-doubao` — 豆包引用权重
- `model-douyin-ai-search` — 抖音 AI 搜索引用权重

### B 层（platform-viral）

- `viral-xiaohongshu` — 小红书爆款逻辑
- `viral-douyin-content` — 抖音爆款逻辑
- `viral-weibo` — 微博爆款逻辑
- `viral-dianping` — 大众点评爆款逻辑
- `viral-zhihu` — 知乎爆款逻辑
- `viral-ctrip` — 携程爆款逻辑
- `viral-netease` — 网易爆款逻辑
- `viral-sohu` — 搜狐爆款逻辑
- `viral-tieba` — 贴吧社区声量（非矩阵八平台，可选）

### 创作准则

- `deep-article-optimization` — 深度优化文章创作准则
- `content-matrix-planning` — 两周跨平台内容矩阵规划准则

### C 层（用户生成，localStorage）

- 由「企业知识库搭建」页生成，不在 git 中跟踪

---

## 调研与持续更新

- 总表：`research/SOURCES.md`（≥20 条可追溯来源）
- 心跳：`research/LOOP.md`（14d 动态调研循环）
