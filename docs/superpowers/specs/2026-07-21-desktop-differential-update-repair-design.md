# 桌面端差分更新修复设计

## 背景与根因

桌面客户端 0.1.3 能从中央 manifest 识别 1.3.5，也能从阿里云 OSS 读取 `latest.yml`，但点击下载后报错：

```text
ENOENT: no such file or directory, open '<安装目录>/resources/app-update.yml'
```

现有 Windows 发版脚本分两段执行 electron-builder：先用 `--dir` 生成 `win-unpacked`，修改主程序图标后，再用 `--prepackaged` 生成 NSIS 安装包。第一段只有 `dir` target，不满足 electron-builder 写入自动更新配置的条件；第二段复用预打包目录，不再执行会写入该配置的打包阶段。因此最终安装目录缺少 `resources/app-update.yml`。

运行时虽然通过 `UPDATE_FEED_URL` 调用了 `setFeedURL()`，所以能够完成“检查更新”，但 `downloadUpdate()` 仍会读取磁盘配置中的 `updaterCacheDirName`。文件缺失后，下载在真正请求安装包之前失败。

已经验证以下外部条件正常：

- OSS `latest.yml` 返回 200，版本为 1.3.5。
- 1.3.5 安装包与 `.blockmap` 返回 200。
- 0.1.3 安装包与 `.blockmap` 仍保留在 OSS。
- OSS 支持 Range 请求并返回 206，满足差分下载要求。
- 中央 manifest 能返回 0.1.3 到 1.3.5 的软更新信息。

## 目标

1. 修复桌面安装包缺少 `app-update.yml` 的根因。
2. 已发布的 0.1.3/1.3.5 客户端可通过一次轻量修复恢复更新能力。
3. 后续 Windows 更新优先使用 NSIS blockmap 差分下载，不要求卸载旧版。
4. 发版前自动阻断缺文件、版本不一致或 OSS 差分资产不完整的发布。
5. 设置页展示简短、可读的版本更新公告。

## 非目标

- 不自研二进制补丁算法，继续使用 electron-updater 的 NSIS 差分能力。
- 不删除用户数据、不要求先卸载旧版。
- 不重构中央 manifest、账号系统或其他业务模块。
- 不覆盖已经发布的 1.3.5 元数据；修复版使用更高版本号发布。

## 方案

### 1. 构建期生成与硬校验

新增独立的更新配置生成器，使用以下唯一来源生成 `app-update.yml`：

- provider：`generic`
- url：`UPDATE_FEED_URL`，无环境覆盖时使用 electron-builder 中登记的 OSS 地址
- updaterCacheDirName：`cuocuo-ai-updater`

Windows 两段式构建在 `win-unpacked` 生成后、NSIS 打包前执行生成器，将配置写入：

```text
release/win-unpacked/resources/app-update.yml
```

随后执行校验。文件缺失、字段为空、provider 非 generic、URL 非 HTTPS 或缓存目录名不一致时，构建立即失败。保留两段式构建是为了继续支持当前的 EXE 图标修补流程。

### 2. 运行时防御性兜底

Electron 启动更新服务时先解析有效更新配置：

1. 正常读取安装目录内的 `resources/app-update.yml`。
2. 若文件缺失但 `UPDATE_FEED_URL`/`CENTRAL_UPDATE_URL` 有效，则在用户数据目录原子写入兜底配置，并将 `autoUpdater.updateConfigPath` 指向它。
3. 若两者都不可用，更新功能返回明确的配置错误，不再暴露原始 `ENOENT` 路径。

兜底配置只包含公开 OSS 地址和缓存目录名，不包含密钥。显式设置 `disableDifferentialDownload = false`，记录所用配置路径与是否启用差分更新，但日志不写入凭证。

### 3. 已发布旧客户端的一次性轻量修复

0.1.3/1.3.5 已经发布，无法远程获得尚未包含在旧代码中的运行时兜底。因此提供一个一次性 PowerShell 修复工具：

- 支持显式传入安装目录。
- 默认从脚本所在目录、当前目录和 HKCU 卸载注册表的 `InstallLocation` 定位安装目录。
- 只有同时找到应用 EXE 与 `resources` 目录才允许写入。
- 若已有配置则先验证；内容不同则生成时间戳备份。
- 原子写入 `resources/app-update.yml`，随后给出“重启客户端并检查更新”的结果。
- 不修改业务文件、用户数据、数据库或登录凭证。

该工具只修复数行配置。旧客户端重启后即可复用 OSS 上保留的 0.1.3 与新版本 `.blockmap` 进行差分更新。若系统策略禁止脚本运行，兜底方式是直接运行新版 NSIS 安装包进行原目录覆盖安装，仍不需要卸载或清除数据。

### 4. 差分更新与发布资产策略

继续使用 electron-builder NSIS target。每个公开版本必须保留：

```text
招财猫-Setup-<version>.exe
招财猫-Setup-<version>.exe.blockmap
latest.yml
```

旧版本安装包和 blockmap 不立即删除，因为 electron-updater 需要新旧 blockmap 计算差异。OSS 上传脚本在上传 `latest.yml` 前检查安装包和 blockmap 成对存在；验收脚本同时检查：

- 本地 `app-update.yml` 字段；
- 本地版本、安装包、blockmap、`latest.yml` 一致；
- 远端最新安装包和 blockmap 均可读；
- 远端安装包支持 Range 请求；
- 指定旧版本的 blockmap 仍可读。

为避免同版本客户端无法获得修复，下一次正式产物使用 1.3.6，而不是覆盖 1.3.5。

### 5. 简洁更新公告

更新页已有 `releaseNotes` 展示区域，不新增复杂 UI。发版元数据写入短公告：

> 修复桌面客户端更新失败问题，启用更快速的差分更新，并提升后续版本更新稳定性。

公告由 `latest.yml` 提供；中央 manifest 的 `CENTRAL_RELEASE_NOTES` 使用相同文本，保证软更新和强制更新提示一致。

## 错误处理

- 缺少本地配置但存在公开 feed：自动生成用户目录兜底并继续。
- feed 未配置：提示“更新配置缺失，请运行更新修复工具或安装新版客户端”。
- 新旧 blockmap 不可用：electron-updater 可退回整包覆盖安装，同时日志明确记录差分回退原因。
- OSS 校验失败：发版脚本停止，不上传或覆盖 `latest.yml`。
- 修复工具无法确认安装目录：停止写入并输出安全的显式路径用法。

## 测试与验收

实施采用测试先行，至少覆盖：

1. 配置生成器输出正确 provider、URL 和 updaterCacheDirName。
2. 非 HTTPS、缺字段和错误缓存目录名被拒绝。
3. 缺少安装目录配置时生成用户目录兜底并设置 updateConfigPath。
4. 已有有效配置时不覆盖。
5. 原始 `ENOENT app-update.yml` 映射为可操作的中文提示。
6. 修复工具仅在确认应用目录后写入，并为不同内容创建备份。
7. 发版校验在缺少 `.blockmap` 或 `app-update.yml` 时失败。
8. Electron TypeScript 编译、相关 Node 测试和桌面更新验收脚本通过。
9. 构建后的 `release/win-unpacked/resources/app-update.yml` 实际存在。
10. 使用隔离测试目录模拟 0.1.3 修复，再检查 1.3.6；真实 OSS UAT 记录下载日志中的 differential download 结果。

## 文件影响范围

预计只修改桌面更新相关文件：

- `electron/services/updater.ts`
- `electron/utils/friendly-update-error.ts`
- `lib/update-error.ts`
- `scripts/dist-win.mjs`
- `scripts/upload-release-oss.mjs`
- `scripts/verify-desktop-update.mjs`
- 新增更新配置生成/校验脚本与旧版修复工具
- 更新相关测试、桌面更新部署文档和版本公告配置

不修改当前工作区中的视频、分发、积分、教程等其他业务改动。
