# 一键分发源码整理包

本目录为中台 **「一键分发」** 相关源码的**副本整理**（从项目中复制，不影响原工程运行）。

- 整理时间：2026-07-18  
- 原项目：`E:\APP\Marketing-Customer-Acquisition-Platform2--`  
- 本包路径：`E:\APP\Marketing-Customer-Acquisition-Platform2--\一键分发源码`

## 架构速览

```
前端 share-distribute.tsx
  → Next.js /api/publish、/api/connectors、/api/share、/api/ai/publish-copy
  → FastAPI main.py
  → lib/publisher/*（抖音/小红书/快手/视频号 Playwright 自动发布）
  → 账号绑定 Cookie：lib/connector_service.py + interactive_login.py
```

## 目录结构

```
一键分发源码/
├── README.md                          ← 本说明
├── backend/
│   └── main.py                        ← 后端入口（含发布/绑定/分享等全部路由）
├── components/
│   ├── share-distribute.tsx           ← 【核心】一键分发 UI
│   ├── account-binding.tsx            ← 账号绑定（扫码登录）
│   ├── dashboard-sidebar.tsx          ← 侧边栏「一键分发」入口
│   └── user-menu.tsx                  ← 登出时清理分发视频缓存
├── app/
│   ├── page.tsx                       ← 主页面路由到 ShareDistribute
│   └── api/
│       ├── publish/                   ← 发布代理
│       ├── connectors/                ← 平台连接/浏览器登录代理
│       ├── share/                     ← 分享页生成
│       ├── ai/publish-copy/           ← AI 填文案
│       └── video/manual-upload/       ← 本地视频上传
└── lib/
    ├── publisher/                     ← 【核心】各平台自动发布引擎
    │   ├── manager.py                 ← 调度：单平台 / 全平台
    │   ├── douyin.py / xiaohongshu.py / kuaishou.py / shipinhao.py
    │   ├── publish_click.py           ← 统一点「发布」
    │   └── ...
    ├── connector_service.py           ← 平台账号与 Cookie 存储
    ├── interactive_login.py           ← 浏览器扫码登录
    ├── video/                         ← share-videos 本地存储
    ├── share-store.ts                 ← 分享落地页
    └── prompts/publish-copy-system.ts ← AI 文案提示词
```

## 核心文件（优先看这些）

| 文件 | 说明 |
|------|------|
| `components/share-distribute.tsx` | 一键分发前端主界面 |
| `lib/publisher/manager.py` | 多平台发布调度 |
| `lib/publisher/douyin.py` | 抖音自动发布 |
| `lib/publisher/xiaohongshu.py` | 小红书自动发布 |
| `lib/publisher/kuaishou.py` | 快手自动发布 |
| `lib/publisher/shipinhao.py` | 视频号自动发布 |
| `components/account-binding.tsx` | 账号绑定 UI |
| `lib/interactive_login.py` | Playwright 扫码登录 |
| `backend/main.py` | FastAPI：`/api/publish*`、`/api/connectors*`、`/api/share*` |

## 说明

1. 本目录是**阅读/备份用副本**，真正运行仍用项目根目录源码。  
2. `backend/main.py` 为完整后端文件（体积较大），其中发布相关主要在文件后半部分（accounts / connectors / publish / share）。  
3. 运行时数据（Cookie 库、Chrome Profile、调试截图）不在本包内，在原项目：
   - `data/accounts.db`
   - `data/profiles/`
   - `data/temp/publish-debug/`
