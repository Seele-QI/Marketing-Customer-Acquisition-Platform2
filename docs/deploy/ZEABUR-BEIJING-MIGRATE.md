# Zeabur 迁北京机操作手册（mcap-prod-test1）

> 配套方案：香港腾讯 2C2G → 阿里云北京 4C8G（同为 Zeabur 托管）。  
> 目标域名保持不变：`mcap-cloud-api.zeabur.app` / `mcap-cloud-web.zeabur.app`（桌面端无感）。

## 旁路与已知差异

- **旁路服务** `clye-caishui-report`：一并 Copy，迁完在新项目停止/删除。
- 当前线上 `GET /api/central/manifest` 可能为 **404**（精简云端镜像）。迁机后若需强更策略，请用本仓 `Dockerfile.api` **Redeploy**，或在云端仓补齐该路由；并把 api 的 `CENTRAL_UPDATE_URL` 指到 OSS。

## A0 事前检查

- [ ] Zeabur **Servers** 中「Aliyun Beijing 4C 8GB」状态为运行中
- [ ] 旧项目 `mcap-prod-test1` 中 `zhongtai-cloud-api` / `zhongtai-cloud-web` 运行中
- [ ] **备份**：进入旧 api → 磁盘/Files → 下载 `/data/accounts.db` 到本机安全目录
- [ ] **导出 env**：api / web「环境变量」各自复制到本地文本保管（勿提交 Git）
- [ ] 记录旧服务 **内部域名**（网络面板），例如 `zhongtai-cloud-api.zeabur.internal:8000`

本机可用：

```powershell
node scripts/verify-beijing-cutover.mjs --phase pre
```

## A1 Copy Project

1. 打开项目 `mcap-prod-test1` → **设置** → **Copy Project**
2. 目标选 **阿里云北京 4C8G** 这台 Server
3. 等待完成（含 Volume，可能较久）
4. 新项目中确认：
   - [ ] `zhongtai-cloud-api` / `zhongtai-cloud-web` Running
   - [ ] api 已挂 Volume `data` → `/data`
   - [ ] 环境变量与旧项目一致
5. 旁路：在新项目中 **暂停或删除** `clye-caishui-report`（若已复制）

临时域名验收：

```powershell
node scripts/verify-beijing-cutover.mjs --phase temp --api https://<新api临时域> --web https://<新web临时域>
```

浏览器打开临时 web → `/admin/credit` → 用户列表应含迁前账号。

## A2 域名切换（短暂停机窗）

顺序不可反：

1. 旧 api / web **解绑**：
   - `mcap-cloud-api.zeabur.app`
   - `mcap-cloud-web.zeabur.app`
2. **立即**绑到新项目对应服务（同名）
3. 核对 web 的 `FASTAPI_URL`：**以新项目网络面板内部域名为准**  
   - 常见：`http://zhongtai-cloud-api.zeabur.internal:8000`  
   - 若 Copy 后仍能用 `http://api.zeabur.internal:8000` 则勿改
4. 若改了 `FASTAPI_URL`，对 web **Redeploy**

验收：

```powershell
node scripts/verify-beijing-cutover.mjs --phase prod
```

- [ ] `https://mcap-cloud-api.zeabur.app/health` → 200 + ffmpeg ok  
- [ ] `https://mcap-cloud-web.zeabur.app/api/health` → 200  
- [ ] 桌面端（不重装）登录 + 积分正常  

## A3 下线香港

确认 prod 验收通过 24h（或至少完整业务抽测）后：

- [ ] 删除或停止香港上的旧项目/服务
- [ ] 若不再需要香港 Server，在 Zeabur Servers 中删除（余额规则以平台为准）

```powershell
node scripts/verify-beijing-cutover.mjs --phase prod
```

## 阶段 B（自动更新）

见 [DESKTOP-UPDATE-OSS.md](./DESKTOP-UPDATE-OSS.md)。迁机不依赖阶段 B。
