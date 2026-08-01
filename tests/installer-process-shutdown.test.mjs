import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

test("closes the running app tree immediately before NSIS replaces installed files", () => {
  const installer = readFileSync(path.join(projectRoot, "build", "installer.nsh"), "utf8")

  assert.match(installer, /!macro\s+customCheckAppRunning/)
  assert.match(
    installer,
    /nsExec::ExecToLog\s+'"\$SYSDIR\\taskkill\.exe"\s+\/F\s+\/T\s+\/IM\s+"\$\{APP_EXECUTABLE_FILENAME\}"'/,
  )
  assert.match(installer, /nsExec::ExecToLog[^\r\n]*\r?\n\s*Pop\s+\$R\d/)
  assert.doesNotMatch(installer, /!macro\s+customInit[\s\S]*?taskkill/i)
})
