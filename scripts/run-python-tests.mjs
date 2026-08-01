import { existsSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const bundledPython = path.join(
  projectRoot,
  "resources",
  "python",
  process.platform === "win32" ? "python.exe" : "bin/python3",
)
const bundledPytest = path.join(projectRoot, ".build-tools", "pytest-runtime")

const candidates = [
  process.env.PYTHON,
  existsSync(bundledPython) ? bundledPython : undefined,
  process.platform === "win32" ? "py" : "python3",
  "python",
].filter(Boolean)

let lastError = ""
for (const command of candidates) {
  const args =
    command === bundledPython && existsSync(bundledPytest)
      ? [
          "-c",
          [
            "import sys",
            `sys.path.insert(0, ${JSON.stringify(bundledPytest)})`,
            "import pytest",
            "raise SystemExit(pytest.main(['tests', '-q']))",
          ].join("; "),
        ]
      : [
          ...(command === "py" ? ["-3"] : []),
          "-m",
          "pytest",
          "tests",
          "-q",
        ]

  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  })
  if (!result.error && result.status !== null) {
    process.exit(result.status)
  }
  lastError = result.error?.message || `unable to start ${command}`
}

console.error(`Unable to run Python tests: ${lastError}`)
process.exit(1)
