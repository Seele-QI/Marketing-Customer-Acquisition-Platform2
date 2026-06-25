# Electron 桌面打包实施计划

> 日期：2026-06-24
> 设计：`docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md`
> 中央激活设计：`docs/superpowers/specs/2026-06-24-central-activation-design.md`

**Goal:** 把现有 Next.js 16 + FastAPI 双服务中台网站打包成 Windows 桌面软件，可分发、可激活、可在线更新。

**Tech Stack:** Electron 33, electron-builder 25, electron-updater 6, electron-log 5, node-machine-id 1.1, Python 3.13 embeddable, pydantic 2.x, Next.js 16.2.0 standalone, FastAPI, TypeScript 5.7.

---

## 阶段 0：Quick Check + 计划落地（已完成 ✅）

- ✅ Quick Check 1：pydantic 2.13.3（v2）
- ✅ Quick Check 2：`.next/standalone` = 89 MB（无需 trace 优化）
- ✅ Quick Check 3：node-machine-id 返回 SHA256
- ✅ 修复 `/auth/verify` 页 useSearchParams Suspense bug（不在原计划，unblock build）
- ✅ 落地 spec / plan 文档

## 文件结构

### 新建

**electron 主进程**（约 30 个 .ts 文件）：
- `electron/main.ts`、`electron/preload.ts`、`electron/tsconfig.json`
- `electron/windows/{main,wizard,log}-window.ts`
- `electron/services/{child-process-manager, env-injector, machine-id, credential-store, activation-client, tray-controller, auto-launch, single-instance, window-guard, updater, logger, log-collector, ipc-router}.ts`
- `electron/ipc/{channels,types}.ts`
- `electron/utils/{paths, port-finder, process-tree, crypto}.ts`

**打包配置**：
- `electron-builder.yml`
- `build/installer.nsh`、`build/icon.ico`

**scripts**：
- `scripts/{build-python-bundle, build-next-standalone, extract-ffmpeg, preflight, dev-electron}.mjs`

**桌面专属页面**：
- `app/(desktop)/setup/{page,layout}.tsx` + `components/desktop/setup-wizard.tsx`
- `app/(desktop)/logs/page.tsx`

**docs**：
- `docs/superpowers/specs/2026-06-24-electron-desktop-packaging-design.md` ✅
- `docs/superpowers/specs/2026-06-24-central-activation-design.md` ✅
- `docs/superpowers/plans/2026-06-24-electron-desktop-packaging-implementation.md`（本文档）✅

### 修改

| 文件 | 修改 |
|---|---|
| `package.json` | 新增依赖：`electron@33`, `electron-builder@25`, `electron-updater@6`, `electron-log@5`；新增 scripts |
| `main.py` | **末尾追加** ~250 行中央服务路由 |
| `requirements.txt` | 锁 `pydantic>=2,<3`、`uvicorn[standard]`、`cryptography>=41` |
| `lib/video_postprocess.py` | **line 66-69** 加 env 优先读取 |
| `next.config.mjs` | 实测无需改 |
| `app/auth/verify/page.tsx` | ✅ 已修（Suspense 包装） |
| `tsconfig.json` | 加 `electron/**/*` 到 include |
| `CLAUDE.md` | 加 `electron/`、`resources/` 结构、`CENTRAL_*` 环境变量、桌面打包章节 |
| `.env.example` | 加 `CENTRAL_*` 示例 |
| `.gitignore` | 加 `dist-electron/`、`release/`、`resources/{python,ffmpeg,next-standalone}/`、`.electron-cache/` |

---

## 阶段 1：Electron 主进程骨架 + 双子进程拉起（2 天）

**Files:**
- Create: `electron/main.ts`
- Create: `electron/preload.ts`
- Create: `electron/tsconfig.json`
- Create: `electron/utils/paths.ts`
- Create: `electron/utils/process-tree.ts`
- Create: `electron/utils/port-finder.ts`
- Create: `electron/services/child-process-manager.ts`
- Create: `scripts/dev-electron.mjs`

**Acceptance:**
- `pnpm electron:dev` 启动后窗口打开，能访问 `http://127.0.0.1:3010`
- 子进程崩溃 5 秒内自动重启，连续 3 次失败托盘弹气泡
- 关闭主窗口 → 仅隐藏；托盘 → 退出 → 两个子进程被 taskkill

### Task 1.1：安装 electron + electron-builder + electron-log

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装依赖**
  ```bash
  cd "f:/A-项目/21-对比合并中台/zhongtai-main"
  pnpm add -D electron@^33 electron-builder@^25 electron-log@^5
  pnpm add electron-updater@^6
  ```
- [ ] **Step 2: package.json 加 scripts**
  ```json
  "electron:dev": "node scripts/dev-electron.mjs",
  "electron:build": "tsc -p electron/tsconfig.json",
  "dist": "pnpm electron:build && electron-builder",
  "dist:win": "pnpm electron:build && electron-builder --win"
  ```

### Task 1.2：写 `electron/tsconfig.json` + 编译路径

**Files:**
- Create: `electron/tsconfig.json`

- [ ] **Step 1: 创建 tsconfig**
  ```json
  {
    "compilerOptions": {
      "target": "ES2022",
      "module": "CommonJS",
      "moduleResolution": "node",
      "outDir": "./dist-electron",
      "rootDir": ".",
      "strict": true,
      "esModuleInterop": true,
      "resolveJsonModule": true,
      "skipLibCheck": true
    },
    "include": ["**/*.ts"]
  }
  ```

### Task 1.3：写 utils 基础模块

**Files:**
- Create: `electron/utils/paths.ts`
- Create: `electron/utils/process-tree.ts`
- Create: `electron/utils/port-finder.ts`

- [ ] **Step 1: paths.ts** — 解析 `process.resourcesPath`、`app.getPath('userData')`
- [ ] **Step 2: process-tree.ts** — Windows 下用 `taskkill /F /T /PID <pid>` 杀进程树
- [ ] **Step 3: port-finder.ts** — 用 `net.createServer()` 探端口占用（备用，主流程用固定端口 3010/8010）

### Task 1.4：写 `child-process-manager.ts`

**Files:**
- Create: `electron/services/child-process-manager.ts`

- [ ] **Step 1: 定义接口**
  ```ts
  interface ChildSpec {
    name: 'next' | 'uvicorn';
    command: string;
    args: string[];
    cwd: string;
    env: NodeJS.ProcessEnv;
    port: number;
    logFile: string;
  }
  ```
- [ ] **Step 2: 实现 `start(spec)`** — spawn + pipe stdout/stderr 到日志文件 + `waitForPort(port, 30_000)`
- [ ] **Step 3: 实现 `handleExit(spec, code)`** — 非 0 退出自动重启，连续 3 次失败弹气泡
- [ ] **Step 4: 实现 `stopAll()`** — taskkill /T /F 杀进程树

### Task 1.5：写 `electron/main.ts` 骨架

**Files:**
- Create: `electron/main.ts`

- [ ] **Step 1: app.whenReady() 之前 setAppUserModelId**
- [ ] **Step 2: 注册单实例锁**（阶段 3 才用，先写框架）
- [ ] **Step 3: 创建主窗口 loadURL('http://127.0.0.1:3010')**
- [ ] **Step 4: 拉起 next + uvicorn 子进程**
- [ ] **Step 5: app.on('before-quit') → stopAll()**

### Task 1.6：写 `scripts/dev-electron.mjs`

**Files:**
- Create: `scripts/dev-electron.mjs`

- [ ] **Step 1: 编译 electron TypeScript**
- [ ] **Step 2: 用 `electron .` 启动，main 字段指向 `electron/dist-electron/main.js`**
- [ ] **Step 3: dev 模式下 spawn dev 期的 next + uvicorn（用现有命令）**

### Task 1.7：手动验收

- [ ] 跑 `pnpm electron:dev`，确认窗口能加载 `http://127.0.0.1:3010`
- [ ] 手动 kill uvicorn，5s 内自动恢复
- [ ] 关闭主窗口不退出，托盘触发器先留空（阶段 3）

---

## 阶段 2：资源打包（3 天）

**Files:**
- Create: `scripts/build-python-bundle.mjs`
- Create: `scripts/build-next-standalone.mjs`
- Create: `scripts/extract-ffmpeg.mjs`
- Create: `scripts/preflight.mjs`
- Modify: `lib/video_postprocess.py`
- Modify: `requirements.txt`

**Acceptance:**
- `python.exe --version` 在 resources 里输出 3.13.x
- `pip list` 显示 10 个依赖到位
- `ffmpeg.exe -version` 在 resources 内可执行
- 端到端：UI 提交视频剪辑 → uvicorn 调用 resources 内 ffmpeg → 产物 mp4 落 userData

### Task 2.1：写 `scripts/extract-ffmpeg.mjs`

- [ ] 解 `tools/ffmpeg/ffmpeg.zip` 到 `resources/ffmpeg/bin/`
- [ ] 校验 `ffmpeg.exe` / `ffprobe.exe` 存在且可执行

### Task 2.2：写 `scripts/build-next-standalone.mjs`

- [ ] 跑 `pnpm build`（已验证：89 MB）
- [ ] copy `.next/standalone/` → `resources/next-standalone/`
- [ ] 写 `resources/main.py`（项目根 copy）
- [ ] copy `assets/bgm/` → `resources/bgm/`

### Task 2.3：写 `scripts/build-python-bundle.mjs`

- [ ] 下载 Python 3.13 embeddable zip（python.org）
- [ ] 解到 `resources/python/`
- [ ] 改 `python313._pth` 删 `# import site` 注释行
- [ ] 跑 `pip install -r requirements.txt --target resources/python/site-packages/`
- [ ] copy `lib/` → `resources/python/lib/`

### Task 2.4：写 `scripts/preflight.mjs`

- [ ] 校验 `resources/python/python.exe` 存在
- [ ] 校验 `resources/python/site-packages/fastapi/__init__.py` 等存在
- [ ] 校验 `resources/ffmpeg/bin/ffmpeg.exe` 可执行
- [ ] 校验 `resources/next-standalone/.next/standalone/server.js` 存在
- [ ] 校验 `resources/main.py` 存在

### Task 2.5：修 `lib/video_postprocess.py:66-69`

**Files:**
- Modify: `lib/video_postprocess.py`

- [ ] **Step 1: 加 env 优先读取**（参见 spec 第"ffmpeg 路径修正"节）

### Task 2.6：锁 requirements.txt

**Files:**
- Modify: `requirements.txt`

- [ ] **Step 1: 改为**
  ```
  fastapi>=0.110,<1.0
  uvicorn[standard]>=0.27,<1.0
  httpx>=0.27,<1.0
  pydantic>=2,<3
  python-dotenv>=1.0,<2.0
  cryptography>=41,<46
  qrcode>=7.4,<8.0
  pillow>=10,<12
  resend>=2.0.0,<3.0
  yt-dlp>=2024.5,<2026.0
  ```

### Task 2.7：手动验收

- [ ] 跑 `node scripts/build-python-bundle.mjs`
- [ ] 跑 `node scripts/build-next-standalone.mjs`
- [ ] 跑 `node scripts/extract-ffmpeg.mjs`
- [ ] 跑 `node scripts/preflight.mjs`，全部 green
- [ ] 临时改 `child-process-manager.ts` 让它用 resources 路径 spawn，验证端到端

---

## 阶段 3：托盘 / 单实例 / 自启动 / 关窗拦截（1.5 天）

**Files:**
- Create: `electron/services/tray-controller.ts`
- Create: `electron/services/auto-launch.ts`
- Create: `electron/services/single-instance.ts`
- Create: `electron/services/window-guard.ts`
- Modify: `electron/main.ts`

### Task 3.1：单实例

- [ ] `app.requestSingleInstanceLock()` 拿锁
- [ ] 第二次启动 → `event.preventDefault()` + 主窗口 `restore()` + `focus()`

### Task 3.2：托盘

- [ ] 创建 Tray icon（用 `build/icon.ico` 16×16）
- [ ] 菜单：打开主面板 / 检查更新（占位）/ 自启动 ✓✗ / 开机最小化 ✓✗ / 打开日志 / 导出日志 / 关于 / 退出
- [ ] 双击托盘 → 唤起主窗口

### Task 3.3：自启动

- [ ] 默认开启，`app.setLoginItemSettings({ openAtLogin: true })`
- [ ] 托盘菜单可切换

### Task 3.4：关窗拦截

- [ ] `mainWindow.on('close', e => { if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); } })`

---

## 阶段 4：electron-updater（1.5 天）

**Files:**
- Create: `electron/services/updater.ts`
- Modify: `electron-builder.yml`
- Create: `build/installer.nsh`

### Task 4.1：updater 服务

- [ ] 配 `autoUpdater.autoDownload = false`、`autoInstallOnAppQuit = true`
- [ ] `update-available` → 托盘通知
- [ ] `update-downloaded` → 弹"立即重启安装"
- [ ] `ipcMain.handle('check-for-update')` 等

### Task 4.2：electron-builder.yml publish

- [ ] `publish.provider = 'github'`
- [ ] `publish.owner` / `repo` 占位

### Task 4.3：installer.nsh

- [ ] 注册表写入 `HKCU\...\Run`（保险起见双写）

---

## 阶段 5：日志查看器 + 一键导出（1.5 天）

**Files:**
- Create: `electron/services/logger.ts`
- Create: `electron/services/log-collector.ts`
- Create: `electron/windows/log-window.ts`
- Create: `app/(desktop)/logs/page.tsx`

### Task 5.1：electron-log

- [ ] 主进程 + 渲染进程统一日志
- [ ] 日志路径 `userData/logs/main-YYYY-MM-DD.log`

### Task 5.2：日志查看器窗口

- [ ] 每 2s IPC 拉一次增量
- [ ] 展示三路（main / next / uvicorn）

### Task 5.3：一键导出 zip

- [ ] 选保存目录 → archiver 打包 `main.log` + `next.log` + `uvicorn.log` + `versions.txt` + `machine-info.txt`（脱敏）

---

## 阶段 6：中央服务（3 天，与客户端并行）

**Files:**
- Modify: `main.py`（**末尾追加**，不动现有路由）
- Create: `tests/test_central_activation.py`

### Task 6.1：DB 初始化

- [ ] `_init_central_db()`：建 2 张表 + WAL + busy_timeout

### Task 6.2：5 个路由

- [ ] `POST /api/central/activate`（含 5 个错误码）
- [ ] `GET /api/central/manifest`
- [ ] `POST /api/central/heartbeat`
- [ ] `GET /api/central/admin/codes`（用 `_require_admin_key`）
- [ ] `POST /api/central/admin/codes`（生成 ZT-XXXX-XXXX-XXXX）

### Task 6.3：测试

- [ ] 4 个错误码路径
- [ ] 限额场景（machine_limit=1，A 激活后 B 拒绝）
- [ ] admin 鉴权

---

## 阶段 7：客户端激活向导 + machine_id + 凭证加解密（2 天）

**Files:**
- Create: `electron/services/machine-id.ts`
- Create: `electron/utils/crypto.ts`
- Create: `electron/services/credential-store.ts`
- Create: `electron/services/activation-client.ts`
- Create: `electron/windows/wizard-window.ts`
- Create: `app/(desktop)/setup/{page,layout}.tsx`
- Create: `components/desktop/setup-wizard.tsx`

### Task 7.1：machine-id

- [ ] `node-machine-id` 拿主板序列号
- [ ] fallback：`hostname + MAC + OS-UUID` 拼接 hash

### Task 7.2：crypto（AES-256-GCM + HKDF）

- [ ] `deriveKey(machineId)` → 32B key
- [ ] `encryptCredentials(plain, machineId)` → `[iv][tag][ct]`
- [ ] `decryptCredentials(blob, machineId)` → plaintext，失败 throw

### Task 7.3：credential-store

- [ ] 读 `userData/credentials.bin` → decrypt → JSON
- [ ] 写 `userData/credentials.bin` ← encrypt
- [ ] 篡改/换机器 → 视作空凭证

### Task 7.4：activation-client

- [ ] `POST /api/central/activate` 包装
- [ ] `GET /api/central/manifest` 包装

### Task 7.5：向导窗口 + 状态机

- [ ] 5 态：`welcome | input | verifying | success | error`
- [ ] 4 步流：欢迎 → 输入激活码 → 验证 → 成功
- [ ] 失败有"重试"/"上一步"

---

## 阶段 8：首次启动检测 + 拉 Key 注入子进程（1.5 天）

**Files:**
- Create: `electron/services/env-injector.ts`
- Modify: `electron/services/child-process-manager.ts`

### Task 8.1：env-injector

- [ ] `inject('uvicorn', baseEnv)` → 拉中央服务 / 解密凭证 / 注入 env / 返回完整 env

### Task 8.2：child-process-manager 改造

- [ ] `start(spec)` 改为 `start(spec, envPromise)`，await envPromise 再 spawn
- [ ] 凭证缺失 → 抛错 → main.ts 弹向导

---

## 阶段 9：联调 + 出包 + 测试矩阵（2 天）

**Files:**
- Modify: `package.json`（最终 scripts）
- Modify: `CLAUDE.md`、`docs/desktop-quickstart.md`

### Task 9.1：完整出包

- [ ] `pnpm resources:build` + `pnpm dist` 产出 NSIS 安装包

### Task 9.2：测试矩阵 17 项

- [ ] 全新机器首次启动
- [ ] 第二次启动
- [ ] 激活码错误 / 过期 / 机器数已满
- [ ] 关闭主窗口 / 真正退出
- [ ] 手动 kill uvicorn / Next
- [ ] 触发更新
- [ ] 凭证被篡改
- [ ] 单实例
- [ ] 一键导出日志
- [ ] 自启动
- [ ] SmartScreen 弹窗

### Task 9.3：文档收口

- [ ] CLAUDE.md 加"桌面打包"章节
- [ ] .env.example 加 CENTRAL_*
- [ ] docs/desktop-quickstart.md 给小白看
- [ ] commit 全部改动

---

## 工期

约 17 个工作日。建议节奏：

```
Day 0     阶段 0（Quick Check + 计划）       ← 已完成 ✅
Day 1-2   阶段 1（Electron 骨架）
Day 3-5   阶段 2（资源打包）
Day 5-6   阶段 3（托盘/单实例）
Day 7     阶段 4（updater）
Day 8-9   阶段 5（日志）
Day 1-9   阶段 6（中央服务，与客户端并行）
Day 10-11 阶段 7（激活向导）
Day 12    阶段 8（env 注入）
Day 13-14 阶段 9（联调 + 出包）
```