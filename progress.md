# 进度日志：项目瘦身

## 2026-06-17
- 初始化规划文件：task_plan.md / findings.md / progress.md
- 取证：`.next` 约 232.7MB，`.tmp` 约 1.3MB；`node_modules` 为 pnpm junction 结构（体积统计可能被重复计算）
- 取证：`.tmp/node-compile-cache` 为 Node/V8 编译缓存，可安全删除并自动再生
- 执行清理：删除 `.next/`、`.tmp/node-compile-cache/`、`.pytest_cache/`、`__pycache__/`、`node_modules/.cache/`
- 固化：更新 `.gitignore`，新增 `pnpm clean:cache`（scripts/clean-cache.mjs），start.bat 支持 `AGENTHUB_CLEAN_CACHE=1` 自动清理缓存后启动
