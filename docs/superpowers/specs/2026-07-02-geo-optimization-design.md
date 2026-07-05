# GEO 优化栏目设计规格

**日期：** 2026-07-02  
**状态：** MVP UI + 创作准则 Skill + 检索 API  
**范围：** 前端 UI、skills/geo 文档库、`/api/geo/*` 检索与 AI 探测

## 创作准则 Skill 库（`skills/geo/`）

| 路径 | 说明 |
|------|------|
| `skills/geo/registry.json` | UI 可选技能注册表（含 `layer: A\|B`） |
| `skills/geo/model-weights/` | **A 层** — 4 个大模型引用权重 Skill |
| `skills/geo/platform-viral/` | **B 层** — 4 个平台爆款逻辑 Skill |
| `skills/geo/research/SOURCES.md` | 论文/同行/官网调研总表（≥20 条） |
| `skills/geo/research/LOOP.md` | 14d 动态调研心跳 |
| `skills/geo/creation-guidelines/deep-article-optimization/` | 深度优化文章创作准则 |
| `.cursor/skills/geo-model-*/SKILL.md` | A 层 Cursor 薄壳（4 个） |
| `.cursor/skills/geo-deep-article-optimization/SKILL.md` | 创作准则 Cursor 薄壳 |

### 深度优化文章创作（A+B+C 知识库）

- 顶：`GeoSkillToolbar` — **A 大模型策略单选** + **B 平台爆款多选** + **C 企业知识库单选**
- localStorage：`geo-article-model-skill`、`geo-article-viral-skills`、`geo-article-enterprise-skill`
- C 层来源：`listEnterpriseSkills()`（localStorage `geo-enterprise-skills-v1`）
- A 层 UI 免责声明：「策略参考，非官方公式」
- 左：`GeoResearchPanel`（多平台检索 + AI 可见度探测）+ 大纲树
- 中：Markdown 编辑器 + 预览
- 右：`GeoScorePanel` + `GeoSchemaPreview`

### A vs B 区分（抖音）

| 层级 | ID | 含义 |
|------|-----|------|
| A | `model-douyin-ai-search` | 抖音 **AI 搜索**引用权重 |
| B | `viral-douyin-content` | 抖音 **内容爆款**文案钩子 |

## 检索 API

| 端点 | 用途 |
|------|------|
| `POST /api/geo/research` | 知乎/小红书/贴吧/热搜 + URL 提取 |
| `POST /api/geo/ai-probe` | DeepSeek 代理 AI 可见度缺口分析 |

环境变量：`JUSTONEAPI_TOKEN`（知乎/小红书）、`SERPAPI_KEY`（贴吧关键词）、`TIANAPI_KEY`（热搜）、`DEEPSEEK_API_KEY`（AI 探测）

## SKILL 契约

路径：`.cursor/skills/geo-creation/`（总览）+ `skills/geo/`（分类准则）

- `geo-creation/SKILL.md` — 四步工作流；第 3 步引用深度优化准则
- `creation-guidelines/deep-article-optimization/SKILL.md` — 创作硬规则与四维清单

## 不在范围

- OAuth 多平台发布、Profound/Otterly 真实 AI 引擎 API
- Electron 独立窗口

## 验收标准

- [x] 侧边栏「GEO优化 NEW」可展开，4 子项可切换
- [x] 深度优化页 A+B+C 知识库选择器（`GeoSkillToolbar`）
- [x] 多平台检索 API 与 UI 面板
- [x] `npx tsc --noEmit` 通过

## 目标

在 AgentHub 主导航新增「GEO优化」可展开栏目（含 4 子页面），提供生成式引擎优化（GEO）工作流的视觉壳层与本地状态交互，并将 `GEO/README.zh.md` 蒸馏为项目级 `geo-creation` SKILL。

## 导航映射

| 侧边栏子项 | View Key | 组件 |
|-----------|----------|------|
| 企业知识库搭建 | `企业知识库搭建` | `GeoKnowledgeBaseView` |
| 内容矩阵规划 | `内容矩阵规划` | `GeoContentMatrixView` |
| 深度优化文章创作 | `深度优化文章创作` | `GeoArticleEditorView` |
| 多平台一键推送 | `多平台一键推送` | `GeoMultiPlatformPushView` |

- **插入位置：**「视频创作」之后、「一键分发」之前
- **父级角标：** `NEW`
- **面包屑：** `GEO优化 / {子页面名}`
- **主色：** `cyan-500`

## 共享组件（`components/geo/`）

| 组件 | 用途 | 挂载页面 |
|------|------|----------|
| `GeoWorkflowShell` | 步骤条 + 页面壳层，accent cyan | 文章创作 |
| `GeoEntityPanel` | 品牌/产品/FAQ 实体表单 | 知识库 |
| `GeoSchemaPreview` | JSON-LD 实时预览 | 知识库、文章创作 |
| `GeoPromptLibrary` | 目标提示词库表格（已弃用） | — |
| `GeoScorePanel` | 四维 GEO 评分进度条 | 文章创作 |
| `GeoMatrixProjectBar` 等 | 多项目 + 两周矩阵 UI | 矩阵规划（`components/geo/matrix/`） |
| `GeoSkillToolbar` | A 单选 + B 多选 + C 企业知识库 | 文章创作 |

## 子页面布局

### 企业知识库搭建

- 左：`GeoEntityPanel`（5/12）
- 右：文档上传 mock + `GeoSchemaPreview`（7/12）
- 底：知识库健康度 checklist（Schema / 实体 / 爬取）

### 内容矩阵规划（2026-07-03 重构）

- 顶：`GeoMatrixProjectBar` 多项目 Tab
- `GeoMatrixSkillBanner` 明示 `content-matrix-planning` Skill
- `GeoMatrixConfigPanel`：8 平台多选 + AI 引擎 + A/B/C 选择 + 生成按钮
- `GeoMatrixPlatformTabs` + `GeoMatrixGrid` + `GeoMatrixCellDrawer`
- API：`/api/geo/matrix-projects`（SQLite `geo_matrix_projects`）
- 已移除：探索/增长/权威期卡片、`GeoPromptLibrary`、`GeoTopicMatrix`

### 深度优化文章创作

- 顶：`GeoWorkflowShell` 四步（选题 → 起草 → GEO 优化 → 导出）
- 左：大纲树
- 中：Markdown 编辑器 + 预览
- 右：`GeoScorePanel` + `GeoSchemaPreview`

### 多平台一键推送

- 左：平台渠道卡片（开关 + 绑定占位）
- 右：`GeoPublishQueue`
- 操作 toast：「功能开发中」

## SKILL 契约

路径：`.cursor/skills/geo-creation/`

- `SKILL.md` — 触发场景、四步工作流、输出模板、指标、伦理边界
- `reference.md` — Ch 1–7 checklist
- `resources.md` — Ch 8 平台与论文链接

## 不在 MVP 范围

- FastAPI / Next.js API 路由
- 真实 AI 调用、OAuth 发布、引用监测 API
- Electron 独立窗口
- 环境变量新增

## 验收标准

- [ ] 侧边栏「GEO优化 NEW」可展开，4 子项可切换
- [ ] 每页完整 UI 壳层（非单行占位）
- [ ] 面包屑 `GEO优化 / {子页面}`
- [ ] `npx tsc --noEmit` 通过
- [ ] 暗色模式样式一致
