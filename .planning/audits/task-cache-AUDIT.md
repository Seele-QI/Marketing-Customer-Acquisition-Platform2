# 任务缓存机制专项审计

> 审计日期：2026-07-05  
> 范围：进度缓存 / 进程缓存 / 历史保存（全部视频相关工作流）

## 症状 → 根因映射

| 用户现象 | 根因 ID |
|---|---|
| 任务进行中切换页面，进程丢失 | F01, F04 |
| 报错后返回上一步无缓存 | F02, F06 |
| 刷新后素材消失 | F03 |

## 发现分类表

| ID | 严重度 | 发现 | 分类 | 涉及文件 |
|---|---|---|---|---|
| F01 | high | 视频子页切换卸载组件，内存草稿丢失 | auto | `components/video/video-workspace.tsx` |
| F02 | high | 图文/混剪/宣传/新数字人无 workflow draft store | auto | 各 `*-workflow.tsx` |
| F03 | high | 大文件素材无跨刷新持久化 | auto | `lib/workflow-asset-store.ts`（新建） |
| F04 | high | 数字人剪辑/字幕轮询组件级，离页停止 | auto | `video-creation-workflow.tsx`, edit adapter |
| F05 | medium | dh-v2 返回上一步 `abandon` 丢跟踪 | auto | `dh-video-v2-workflow.tsx` |
| F06 | medium | 图文/混剪失败仅 step3 + 全清 reset | auto | `image-video-workflow.tsx`, `mashup-video-workflow.tsx` |
| F07 | medium | 文案提取 URL 输入未持久化 | auto | `copywriting-extract-view.tsx` |
| F08 | low | runtime `sanitizeTask` 将非终态一律复活为 running | manual | `lib/task-runtime/store.ts` |
| F09 | low | 数字人口播双写（task-store + runtime）易漂移 | manual | 后续收敛 |

## 三套机制现状

### 1. 进程缓存（TaskRuntime）

- 存储：`localStorage` key `agenthub-runtime-tasks`
- 轮询：单例 `getTaskRuntime()`，与 React 树解耦
- 覆盖：6 种 TaskKind 主生成管线
- 缺口：数字人剪辑/字幕仍组件内轮询；dh-v2 回退 abandon

### 2. 进度/草稿缓存

- 数字人口播：`video-creation-task`（完整，但排除 base64）
- 其他工作流：仅 `useState`，无 draft store
- 缺口：切页/刷新丢步骤与素材引用

### 3. 历史保存

- 存储：`video-history` via `history-bridge.ts`
- 触发：TaskRuntime 终态 + digital-human 半成品
- 缺口：失败但有 videoUrl 时未统一写历史

## UAT 验收清单

- [ ] 图文视频：step1 填素材 → 提交 → 切工作台 → 回来：进度 + 素材 + 步骤正确
- [ ] 视频混剪：同上
- [ ] 数字人口播：进入剪辑 → 切 GEO → 回来：剪辑进度继续
- [ ] 新数字人：分镜页报错 → 返回修改素材：图片/文案/分镜仍在
- [ ] 宣传视频：填表 → 切页 → 回来：表单与素材恢复
- [ ] 文案提取：输入 URL → 切页 → 回来：URL 保留
- [ ] 刷新浏览器：各工作流素材与步骤可恢复
- [ ] 任务完成：历史记录可下载；侧栏 running 指示消失

## 修复阶段

| Phase | Findings | 状态 |
|---|---|---|
| 1 | F01, F05 | done |
| 2 | F02, F06, F07 | done |
| 3 | F03 | done |
| 4 | F04 + 历史加固 | done |
