# 内容矩阵规划板块重构规格

**日期：** 2026-07-03  
**状态：** 已实施  
**范围：** 多项目 SQLite 存储、content-matrix-planning Skill、两周矩阵 UI、AI 生成 API

## 目标

将「内容矩阵规划」从静态主题×平台表格重构为：

- 顶栏 **多项目**（服务端 `geo_matrix_projects`，登录用户隔离）
- **8 平台多选** + A/B/C 知识库配置下沉到配置区
- **一键 AI 生成** 近两周跨平台关联矩阵（`content-matrix-planning` Skill）
- 按平台 Tab + 单元格抽屉展示创作方向
- 移除探索/增长/权威期卡片与目标提示词库

## 数据模型

表 `geo_matrix_projects`（见 `scripts/init_credit_db.py`）：

| 列 | 说明 |
|----|------|
| `platforms_json` | 选中平台 ID 列表 |
| `matrix_json` | `{ platforms: PlatformMatrix[] }` |
| `enterprise_snapshot` | 生成时 C 层 content 快照 |

## API

| 方法 | 路径 | 实现 |
|------|------|------|
| GET/POST | `/api/geo/matrix-projects` | FastAPI + Next 代理 |
| PATCH/DELETE | `/api/geo/matrix-projects/{id}` | FastAPI + Next 代理 |
| POST | `/api/geo/matrix-projects/{id}/generate` | Next.js（`completeText` + prompt） |

## Skill

- `skills/geo/creation-guidelines/content-matrix-planning/`
- Registry ID：`content-matrix-planning`
- Cursor 薄壳：`.cursor/skills/geo-content-matrix-planning/SKILL.md`

## UI 组件

`components/geo/matrix/`：

- `geo-matrix-project-bar`
- `geo-matrix-skill-banner`
- `geo-matrix-config-panel`
- `geo-matrix-platform-tabs`
- `geo-matrix-grid`
- `geo-matrix-cell-drawer`

主页面：`components/geo-content-matrix-view.tsx`

## 验收

1. 8 平台可多选
2. 可选 GEO 知识引擎（LLM provider + A 层）
3. 每平台 2 周表格 + 单元格创作方向 + Skill 明示
4. 无三期卡片
5. 可选 C 层企业知识库参与生成
6. 顶栏多项目服务端存储
7. 目标提示词库已移除

## 测试

- `tests/test_geo_matrix_store.py` — CRUD + 用户隔离
- `npx tsc --noEmit`
