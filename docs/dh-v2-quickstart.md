# 数字人视频创作（新）— 睡醒就能用

> 基于 **Seedance 2.0 Fast**（aicost.xyz）的多段 15s 口播生成 + ffmpeg 拼接。  
> 侧边栏入口：**视频创作 → 数字人视频创作（新）**

---

## 1. 环境（已配置可跳过）

`.env` 需包含：

```env
SEEDANCE_API_KEY=sk-你的密钥
SEEDANCE_BASE_URL=https://www.aicost.xyz
NEXT_PUBLIC_DH_VIDEO_V2_MOCK=0
# 分镜 AI（GPT 优先 → Claude → DeepSeek，禁止本地模板）
SONETTO_GPT_API_KEY=sk-...
SONETTO_CLAUDE_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
# 多段并发上限（默认 4）
DH_V2_MAX_PARALLEL_SEGMENTS=4
```

启动服务：

```bash
pnpm dev:all
```

浏览器打开 `http://localhost:3000`，**先登录**（提交/分镜接口需要会话）。

---

## 2. 用户操作（3 步）

| 步骤 | 你要做的 |
|------|----------|
| **填写素材** | 上传 1 张人物参考图 + 粘贴口播文案；可选上传 2–15 秒参考音频、填写画面风格 |
| **生成中** | 点 **「生成视频」**，GPT 读图语义拆段并写提示词，多段并发提交 Seedance；**横向展示各段进度**，失败段可点「重试本段」 |
| **成片预览** | 全部段成功后自动拼接；预览区上方可看各段，下方下载 `final.mp4` |

**高级**：勾选「生成前编辑分镜脚本」可改 AI 分镜后再提交。

**每段台词字数**：**42–49 字**（2.8–3.3 字/秒 × 15 秒）。分镜面板会标黄提示偏短/偏长段。

---

## 3. 积分

- 按规划时长计费（见按钮上的预估积分）
- 长文案 = 多段 = 更高积分与更长等待

---

## 4. 命令行自测（不经过 UI）

```bash
python tools/verify_dh_video_v2.py --smoke
python tools/verify_dh_video_v2.py --full
python tools/verify_dh_video_v2.py --concat
```

---

## 5. 已知限制

1. **等待时间**：视频创作约 **3–15 分钟**，请耐心等待；单段 Seedance 超时默认 **15 分钟**（`DH_V2_SEGMENT_POLL_TIMEOUT=900`），超时后可重试该段。
2. **分段重试**：部分段失败不会整单作废，生成页横向卡片上点「重试本段」。
3. **分镜慢速**：AI 分镜超过 **2 分钟**会提示重试（不自动二次调用）。
4. **无台词段自动跳过**：空台词不会生成提示词、不会提交 Seedance。
5. **任务存内存**：重启 FastAPI 会丢失进行中的任务。
6. **必须登录**：未登录会 401。
7. **参考音频**：仅 2–15 秒有效。
8. **分镜必须走大模型**：须配置 `SONETTO_GPT_API_KEY` / `SONETTO_CLAUDE_API_KEY` / `DEEPSEEK_API_KEY` 至少一项；不再使用本地模板兜底。
9. **积分展示未扣费**：按钮显示预估积分，提交时尚未实际扣减。

---

## 6. 故障排查

| 现象 | 处理 |
|------|------|
| `SEEDANCE_API_KEY 未配置` | 检查 `.env` 并重启 `uvicorn` |
| 分镜段数字数标黄 | 合并/拆分文案使每段 42–49 字 |
| 分镜 API 503 | 配置 SONETTO_GPT / SONETTO_CLAUDE / DEEPSEEK 至少一个 Key |
| 分镜超过 2 分钟 | 点「重试分镜」重新调用大模型 |
| 某段视频失败/超时 | 生成页横向卡片点「重试本段」 |
| 视频 404 | 确认 FastAPI 在跑，`NEXT_PUBLIC_FASTAPI_URL` 正确 |

---

## 7. 核心文件

- UI：`components/dh-video-v2-workflow.tsx`、`components/dh-video-v2/segment-strip.tsx`
- 分镜 AI：`app/api/dh-video-v2/plan-script/route.ts`、`lib/dh-video-v2/plan-script-ai.ts`
- 后端管线：`lib/dh_video_v2_service.py`（段级状态 + 并发 + 局部重试）
- 重试接口：`POST /api/dh-video-v2/retry-segment`
- 字数规则：`lib/dh-video-v2/script-plan.ts`
