# 一键生成宣传视频 - 技术架构文档

> 实施日期: 2026-06-25

## 用户流程

1. **填写产品信息表单** → 产品名称、图片、卖点、受众、风格、时长、分镜数量、视频比例
2. **AI生成分镜图** → DeepSeek 自动生成创意提示词 → RunningHub ComfyUI 工作流生成 grid 图 → 后端 Python Pillow 裁剪为单帧
3. **用户挑选分镜** → 前端宫格展示 → 用户勾选喜欢的帧 → 可重新填写
4. **AI生成视频提示词** → DeepSeek 根据产品信息 + 选中帧数量生成 Seedance 提示词 → 用户可编辑
5. **生成宣传视频** → 上传选中帧到 RunningHub → 调用 Seedance 2.0 SparkVideo API → 多段拼接（30s/45s/60s）

## API 集成

### RunningHub 分镜生成
- Endpoint: POST openapi/v2/run/ai-app/2004879210508419073
- nodeId "5": channel(Official/Third-party), resolution(1k/2k/4k/8k)
- nodeId "31": select(1=9宫格, 2=16宫格, 3=25宫格)
- nodeId "14": select(2=图生图模式)
- nodeId "13": image(参考图片URL)
- nodeId "7": text(提示词)

### RunningHub Seedance 2.0 SparkVideo
- Endpoint: POST openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video
- prompt 支持 @Image 1~N 引用图片
- duration: 4~15秒, resolution: 480p~4k
- imageUrls: 0-9张, generateAudio: true
- ratio: adaptive/16:9/9:16/1:1/3:4/4:3/21:9

### DeepSeek
- 分镜图提示词：STORYBOARD_SYSTEM_PROMPT
- 视频提示词：VIDEO_PROMPT_SYSTEM_PROMPT（含 @Image N 引用格式）

## 扣费逻辑
- 每15秒800积分
- 用户选择时长决定总扣费
- 提交视频生成时扣费

## 文件清单

| 文件 | 角色 |
|---|---|
| components/promo-video-workflow.tsx | 前端完整工作流组件 |
| lib/promo_video_service.py | Backend service: DeepSeek, RunningHub, PIL裁剪, ffmpeg拼接 |
| routes/promo_video_routes.py | FastAPI 路由: submit/storyboard-status/auto-prompt/generate-video/video-status |
| main.py | 注册路由 + Pydantic 模型 + 后台异步任务 |
| app/page.tsx | 入口页面, 渲染PromoVideoWorkflow |
| components/dashboard-sidebar.tsx | 侧边栏菜单含"宣传视频"入口 |
