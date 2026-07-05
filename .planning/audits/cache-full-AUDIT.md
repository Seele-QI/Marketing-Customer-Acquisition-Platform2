# 全站缓存机制审计

> 审计日期：2026-07-05  
> 范围：全产品 localStorage / IndexedDB / TaskRuntime 持久化

## 缓存矩阵

| 模块 | 存储键 / 机制 | 持久化内容 | 状态 |
|---|---|---|---|
| 数字人口播任务 | `video-creation-task` + TaskRuntime | 步骤、脚本、任务 ID、剪辑阶段 | ✅ |
| 数字人口播素材 | `workflow-asset-store` (`digital-human`) | 图片/音频 IDB | ✅ |
| 图文视频 | `agenthub-workflow-drafts` + IDB | 步骤、文案、素材引用 | ✅ |
| 视频混剪 | 同上 (`mashup`) | 同上 | ✅ |
| 新数字人 v2 | 同上 (`dh-video-v2`) + IDB | 分镜、素材引用 | ✅（工作区未提交） |
| 宣传视频 | 同上 (`promo-video`) + IDB | 表单、素材引用 | ✅ |
| 文案提取 | 同上 (`copywriting-extract`) | URL、编辑文本 | ✅ |
| **身份定位** | `ip-positioning-session-v1` + IDB (`ip-positioning`) | 向导、intake、报告、文档 | ✅ 本次修复 |
| AI 对话 | `chat-workspace` per-device | 会话列表、消息 | ✅ |
| 文案对话 | `copywriting-chat-*` | 多 Agent 会话 | ✅ |
| 用户记忆 | `user-memory` | 对话提取记忆 | ✅ |
| 热点 | `hot-topics-*` | 爬取计数、看板 | ✅ |
| GEO 文章批次 | `geo-article-batch` | 批量任务 | ✅ |
| GEO 企业 Skill | `geo-enterprise-skills` | 用户 Skill | ✅ |
| 视频历史 | `video-history` | 完成/半成品记录 | ✅ |
| 主题/偏好 | `theme` / `dh-v2-ui-prefs` | UI 偏好 | ✅ |
| 定位对话弹窗 | 父组件 archive | 非全局，随父卸载 | ⚠️ manual |

## 发现分类表（gsd-audit-fix）

| ID | 严重度 | 发现 | 分类 | 状态 |
|---|---|---|---|---|
| F10 | high | 身份定位无缓存：切页/刷新丢向导、资料、报告 | auto | **fixed** |
| F11 | medium | `HISTORY_MAX_AGE_MS` 测试断言 7 天与实现 14 天不一致 | auto | **fixed** |
| F12 | medium | dh-v2 workflow draft 改动未纳入上次提交 | auto | pending（工作区） |
| F08 | low | runtime `sanitizeTask` 非终态一律复活为 running | manual | — |
| F09 | low | 数字人口播双写 task-store + runtime | manual | — |
| F13 | low | `positioning-chat-dialog` 无独立持久化 | manual | — |

## F10 修复说明

- 新建 `lib/ip-positioning-store.ts`：localStorage 会话（不含 base64）
- 新建 `lib/ip-positioning-asset-persist.ts`：文档 IDB 读写
- 扩展 `workflow-asset-store`：`ip-positioning` 命名空间 + `document` kind
- `positioning-intake-wizard`：mount hydrate + 变更 debounce save
- `account-positioning`：恢复报告视图；`analyzing` 不跨刷新（请求已中断）
- 重新开始：clear session + clear IDB assets

## UAT 验收（身份定位）

- [ ] 填到第 3 步 + 上传 PDF → 切到其他侧栏 → 回来：步骤与资料仍在
- [ ] 生成报告成功 → 切页 → 回来：直接显示报告
- [ ] 刷新浏览器：向导进度 / 报告 / 上传文件可恢复
- [ ] 分析进行中刷新：回到向导（非 spinner），可重新提交
- [ ] 点击「重新诊断」：清空会话与 IDB 文档

## 关联文档

- [task-cache-AUDIT.md](./task-cache-AUDIT.md) — 视频工作流专项（F01–F09）
