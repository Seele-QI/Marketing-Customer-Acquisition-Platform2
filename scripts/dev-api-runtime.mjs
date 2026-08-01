import path from "node:path"

export function defaultUvicornArgs() {
  return ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"]
}

export function sanitizeUvicornArgs(args, platform = process.platform) {
  if (platform !== "win32") return [...args]
  const optionsWithValue = new Set(["--reload-dir", "--reload-delay", "--reload-include", "--reload-exclude"])
  const result = []
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index]
    if (value === "--reload") continue
    if (optionsWithValue.has(value)) {
      index += 1
      continue
    }
    result.push(value)
  }
  return result
}

export function isWatchedPythonPath(filePath) {
  const normalized = String(filePath || "").replaceAll("\\", "/").replace(/^\.\//, "")
  if (!normalized.endsWith(".py") || normalized.includes("/__pycache__/") || normalized.endsWith(".pyc")) return false
  return normalized === "main.py" || normalized.startsWith("lib/")
}

export function createRestartDebouncer(callback, delayMs = 500) {
  let timer = null
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      callback()
    }, delayMs)
  }
  schedule.dispose = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }
  return schedule
}

export function relativeWatchedPath(root, directory, filename) {
  return path.relative(root, path.join(directory, String(filename || ""))).replaceAll("\\", "/")
}
