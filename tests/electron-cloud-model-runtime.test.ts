import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { test } from "node:test"

const injectorSource = readFileSync(
  new URL("../electron/services/env-injector.ts", import.meta.url),
  "utf8",
)
const mainSource = readFileSync(new URL("../electron/main.ts", import.meta.url), "utf8")

test("Electron-injected child environments are marked as desktop runtime", () => {
  assert.match(injectorSource, /merged\.DESKTOP_RUNTIME\s*=\s*'1'/)
})

test("Electron development Next process receives synced cloud credentials", () => {
  assert.match(mainSource, /const injectedNextDev[\s\S]*?await injectApiKeys\(devEnv\)/)
  assert.match(mainSource, /name: 'next'[\s\S]*?env: injectedNextDev/)
})
