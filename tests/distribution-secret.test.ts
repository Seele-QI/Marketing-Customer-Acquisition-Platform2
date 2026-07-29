import assert from "node:assert/strict"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"

import { loadOrCreateDistributionSecret } from "../electron/utils/distribution-secret.ts"

test("首次启动生成并加密保存分发密钥", () => {
  const dir = mkdtempSync(join(tmpdir(), "distribution-secret-"))
  try {
    const file = join(dir, "distribution-secret.bin")
    const secret = loadOrCreateDistributionSecret(file, "machine-a")

    assert.ok(secret.length >= 32)
    assert.equal(readFileSync(file).includes(Buffer.from(secret)), false)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("后续启动复用同一分发密钥", () => {
  const dir = mkdtempSync(join(tmpdir(), "distribution-secret-"))
  try {
    const file = join(dir, "distribution-secret.bin")
    const first = loadOrCreateDistributionSecret(file, "machine-a")
    const second = loadOrCreateDistributionSecret(file, "machine-a")

    assert.equal(second, first)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("密钥文件损坏或换设备后自动轮换", () => {
  const dir = mkdtempSync(join(tmpdir(), "distribution-secret-"))
  try {
    const file = join(dir, "distribution-secret.bin")
    const first = loadOrCreateDistributionSecret(file, "machine-a")
    writeFileSync(file, Buffer.from("corrupt"))
    const afterCorruption = loadOrCreateDistributionSecret(file, "machine-a")
    const afterMove = loadOrCreateDistributionSecret(file, "machine-b")

    assert.notEqual(afterCorruption, first)
    assert.notEqual(afterMove, afterCorruption)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
