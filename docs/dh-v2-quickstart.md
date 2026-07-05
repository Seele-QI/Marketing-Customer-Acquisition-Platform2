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
DEEPSEEK_API_KEY=sk-...   # 可选，用于 AI 分镜；失败会自动用本地模板
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
| **生成中** | 点 **「生成视频」**，系统自动生成分镜并提交；每段约 8–15 分钟 |
| **成片预览** | 完成后预览 / 下载 `final.mp4` |

**高级**：勾选「生成前编辑分镜脚本」可改 AI 分镜后再提交。

**文案时长**：按约 3 字/秒估算，自动切成多段 15s（例如 45 字 ≈ 1 段，80 字 ≈ 2 段）。

---

## 3. 积分

- 按规划时长计费（见按钮上的预估积分）
- 长文案 = 多段 = 更高积分与更长等待

---

## 4. 命令行自测（不经过 UI）

```bash
# 单段 API 连通（约 8–15 分钟）
python tools/verify_dh_video_v2.py --smoke

# 两段 + 拼接（约 20–35 分钟）
python tools/verify_dh_video_v2.py --full

# 仅测 ffmpeg 拼接（需先跑过 --smoke 产出 dh_v2_smoke.mp4）
python tools/verify_dh_video_v2.py --concat
```

---

## 5. 已知限制

1. **等待时间长**：每段 Seedance 任务通常 8–20 分钟，多段顺序执行；单段最长等待 30 分钟。
2. **任务存内存**：重启 FastAPI 会丢失进行中的任务（刷新页面后需重新提交）。
3. **必须登录**：未登录会 401。
4. **参考音频**：仅 2–15 秒有效，过长/过短会上传校验失败。
5. **仅 Seedance**：星河渠道 UI 已隐藏，后端亦未实现。
6. **积分展示未扣费**：按钮显示预估积分，当前版本提交时尚未接入积分扣减（后续可接 `consume-metered`）。
7. **密钥安全**：`.env` 勿提交 git；聊天里暴露的 Key 建议轮换。

---

## 6. 故障排查

| 现象 | 处理 |
|------|------|
| `SEEDANCE_API_KEY 未配置` | 检查 `.env` 并重启 `uvicorn` |
| `ConnectError` / 网络错误 | 已禁用系统代理并重试；检查本机网络/VPN |
| 生成失败可重试 | 点「返回修改后重试」 |
| AI 分镜失败 | 会自动用本地模板，仍可生成 |
| 视频 404 | 确认 `pnpm dev:all` 中 FastAPI 在跑，`NEXT_PUBLIC_FASTAPI_URL` 指向 8000 |

---

## 7. 核心文件

- UI：`components/dh-video-v2-workflow.tsx`
- 后端：`routes/dh_video_v2_routes.py`、`lib/dh_video_v2_service.py`
- 分镜：`lib/dh-video-v2/script-plan.ts`、`lib/dh_video_v2_script_plan.py`
