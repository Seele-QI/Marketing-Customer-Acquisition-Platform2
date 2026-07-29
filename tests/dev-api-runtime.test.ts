import assert from "node:assert/strict"
import test from "node:test"

import {
  createRestartDebouncer,
  defaultUvicornArgs,
  isWatchedPythonPath,
  sanitizeUvicornArgs,
} from "../scripts/dev-api-runtime.mjs"

test("Windows 默认 Uvicorn 参数不启用内置 reload", () => {
  const args = defaultUvicornArgs()
  assert.equal(args.includes("--reload"), false)
  assert.deepEqual(args.slice(0, 2), ["-m", "uvicorn"])
})

test("Windows 显式传入 reload 也会被移除", () => {
  assert.deepEqual(
    sanitizeUvicornArgs(["-m", "uvicorn", "main:app", "--reload"], "win32"),
    ["-m", "uvicorn", "main:app"],
  )
})

test("文件监听只处理后端 Python 源码", () => {
  assert.equal(isWatchedPythonPath("main.py"), true)
  assert.equal(isWatchedPythonPath("lib/interactive_login.py"), true)
  assert.equal(isWatchedPythonPath("components/page.tsx"), false)
  assert.equal(isWatchedPythonPath("lib/__pycache__/main.pyc"), false)
})

test("连续文件变化只触发一次重启", async () => {
  let restarts = 0
  const schedule = createRestartDebouncer(() => { restarts += 1 }, 20)
  schedule()
  schedule()
  schedule()
  await new Promise((resolve) => setTimeout(resolve, 60))
  assert.equal(restarts, 1)
  schedule.dispose()
})
