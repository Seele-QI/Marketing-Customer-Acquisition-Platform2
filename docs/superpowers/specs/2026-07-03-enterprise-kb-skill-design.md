# 企业知识库 Skill 生成设计规格

**日期：** 2026-07-03  
**状态：** MVP 已实施  
**范围：** 企业知识库搭建页、C 层 Skill 生成与存储、GeoSkillToolbar 三栏选择器

## 目标

用户在企业知识库搭建页填写实体、上传资料后，选择大模型生成命名企业 Skill（C 层），并在内容矩阵规划与深度优化文章创作页的右上角工具栏中选用。

## 三层知识库架构

| 层级 | 来源 | 存储 |
|------|------|------|
| A | `skills/geo/model-weights/*` | git 静态 registry |
| B | `skills/geo/platform-viral/*` | git 静态 registry |
| C | 用户生成 | localStorage `geo-enterprise-skills-v1` |

运行时合并：`lib/geo/skills-registry.ts` → `listEnterpriseSkills()` 将 C 层转为 `GeoSkillEntry`（`layer: "C"`, `category: "enterprise-knowledge"`）。

## 页面布局（企业知识库搭建）

```
┌─────────────────────────────────────────────────────────┐
│ Hero：企业知识库搭建                                      │
├──────────────────────┬──────────────────────────────────┤
│ 实体建模              │  资料库（.txt/.md）               │
├──────────────────────┴──────────────────────────────────┤
│ 生成企业 Skill（名称 + 模型 + 预览 + 保存）              │
├─────────────────────────────────────────────────────────┤
│ 健康度：实体完整 / 文档已入库 / Skill 就绪               │
└─────────────────────────────────────────────────────────┘
```

已移除：`GeoSchemaPreview` 与 Organization/Product/FAQPage JSON-LD 预览块。

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/geo/enterprise-skill/generate` | POST | 实体 + 文档 → SKILL.md 正文 |
| `/api/geo/llm-providers` | GET | 6 模型配置状态 |

### 请求体（generate）

```json
{
  "provider": "deepseek",
  "skillName": "某某科技 GEO 知识库",
  "entity": { "companyName", "industry", "coreProduct", "authorityLinks", "faqs" },
  "documents": [{ "name": "intro.md", "text": "..." }]
}
```

## 大模型 Router

`lib/geo/llm/router.ts` — `completeText({ provider, system, user })`

| ID | 环境变量 | MVP 状态 |
|----|----------|----------|
| deepseek | DEEPSEEK_API_KEY | 完整 |
| doubao | ARK_API_KEY + ARK_ENDPOINT_ID | 完整 |
| kimi | KIMI_API_KEY | 接口就绪，无 Key 时 503 |
| gpt | OPENAI_API_KEY | 同上 |
| claude | ANTHROPIC_API_KEY | 同上 |
| gemini | GEMINI_API_KEY | 同上 |

## 客户端存储

- Skill 列表：`geo-enterprise-skills-v1`
- 文章/矩阵选中：`geo-article-enterprise-skill`
- 上限：20 条 Skill，单条正文 32KB

## 组件

| 组件 | 路径 |
|------|------|
| GeoDocUploadPanel | `components/geo/geo-doc-upload-panel.tsx` |
| GeoLlmProviderSelect | `components/geo/geo-llm-provider-select.tsx` |
| GeoSkillGeneratorPanel | `components/geo/geo-skill-generator-panel.tsx` |
| GeoSkillToolbar | `components/geo/geo-knowledge-base-picker.tsx` |

## 二期（未实施）

- 将 C 层 `content` 注入 AI 创作 prompt（与 A/B 相同管线）
- PDF/Word 服务端解析
- 导出 Skill 到 `skills/geo/enterprise-knowledge/custom/`

## 验收标准

- [x] 上传 .md/.txt 后可选择 DeepSeek/豆包生成命名 Skill
- [x] 生成的 Skill 出现在矩阵规划、深度文章右上角 C 层下拉
- [x] 页面无 JSON-LD 代码块预览
- [x] 无 Key 的模型显示禁用与配置提示
- [x] `npx tsc --noEmit` 通过
