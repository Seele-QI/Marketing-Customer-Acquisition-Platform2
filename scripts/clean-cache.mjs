import fs from "node:fs"
import path from "node:path"

const targets = [
  ".next",
  path.join(".tmp", "node-compile-cache"),
  ".pytest_cache",
  "__pycache__",
  path.join("node_modules", ".cache"),
  "tsconfig.tsbuildinfo",
]

function safeRemove(rel) {
  const abs = path.resolve(process.cwd(), rel)
  if (!fs.existsSync(abs)) return
  try {
    fs.rmSync(abs, { recursive: true, force: true })
    process.stdout.write(`removed ${rel}\n`)
  } catch (e) {
    process.stderr.write(`failed ${rel}: ${e?.message || String(e)}\n`)
  }
}

for (const rel of targets) safeRemove(rel)
