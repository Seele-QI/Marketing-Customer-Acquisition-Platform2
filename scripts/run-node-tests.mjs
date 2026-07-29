import { readdirSync } from "node:fs"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const testsDir = path.join(projectRoot, "tests")
const testFiles = readdirSync(testsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.test\.(?:ts|mjs)$/.test(entry.name))
  .map((entry) => path.join(testsDir, entry.name))
  .sort()

if (testFiles.length === 0) {
  console.error("No Node test files found under tests/")
  process.exit(1)
}

console.log(`Running ${testFiles.length} Node test files`)
const result = spawnSync(
  process.execPath,
  [
    "--experimental-strip-types",
    "--loader",
    pathToFileURL(path.join(testsDir, "alias-loader.mjs")).href,
    "--test",
    ...testFiles,
  ],
  {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  },
)

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status ?? 1)
