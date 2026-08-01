import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  __resetOtpStoreForTests,
  isAdminPhone,
  isValidCnMobile,
  maskPhone,
  normalizePhone,
  sendAdminPhoneLoginCode,
  verifyAdminPhoneLoginCode,
} from "../lib/admin-phone-login/index.ts"

function setEnv(name: string, value: string | undefined): () => void {
  const previous = process.env[name]
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
  return () => {
    if (previous === undefined) delete process.env[name]
    else process.env[name] = previous
  }
}

function withEnv(values: Record<string, string | undefined>, fn: () => void | Promise<void>) {
  const restores = Object.entries(values).map(([name, value]) => setEnv(name, value))
  return Promise.resolve(fn()).finally(() => {
    for (const restore of restores.reverse()) restore()
  })
}

describe("admin-phone-login phone utils", () => {
  it("normalizes +86 prefix", () => {
    assert.equal(normalizePhone("+86 180 0063 4365"), "18000634365")
  })

  it("validates mainland mobile", () => {
    assert.equal(isValidCnMobile("18000634365"), true)
    assert.equal(isValidCnMobile("12345"), false)
  })

  it("masks phone", () => {
    assert.equal(maskPhone("18000634365"), "180****4365")
  })
})

describe("admin-phone-login service", () => {
  it("rejects non-admin phone", async () => {
    await withEnv(
      {
        CREDIT_ADMIN_ACCESS_KEY: "test-admin-key",
        ADMIN_LOGIN_NAME: "18000634365",
        DEV_SMS_MODE: "1",
      },
      async () => {
        __resetOtpStoreForTests()
        const result = await sendAdminPhoneLoginCode({
          phone: "13900001111",
          ip: "127.0.0.1",
        })
        assert.equal(result.ok, false)
        if (!result.ok) {
          assert.equal(result.code, "PHONE_NOT_ALLOWED")
        }
      },
    )
  })

  it("sends and verifies code in dev sms mode", async () => {
    await withEnv(
      {
        CREDIT_ADMIN_ACCESS_KEY: "test-admin-key",
        ADMIN_LOGIN_NAME: "18000634365",
        DEV_SMS_MODE: "1",
      },
      async () => {
        __resetOtpStoreForTests()
        const sent = await sendAdminPhoneLoginCode({
          phone: "18000634365",
          ip: "127.0.0.1",
        })
        assert.equal(sent.ok, true)
        if (!sent.ok) return
        assert.equal(sent.maskedPhone, "180****4365")
        assert.ok(sent.devCode)

        const bad = verifyAdminPhoneLoginCode({ phone: "18000634365", code: "000000" })
        assert.equal(bad.ok, false)

        const ok = verifyAdminPhoneLoginCode({ phone: "18000634365", code: sent.devCode! })
        assert.equal(ok.ok, true)
        if (ok.ok) assert.equal(ok.phone, "18000634365")
      },
    )
  })

  it("isAdminPhone uses ADMIN_PHONE when set", async () => {
    await withEnv(
      {
        ADMIN_PHONE: "13800138000",
        ADMIN_LOGIN_NAME: "18000634365",
      },
      () => {
        assert.equal(isAdminPhone("13800138000"), true)
        assert.equal(isAdminPhone("18000634365"), false)
      },
    )
  })
})
