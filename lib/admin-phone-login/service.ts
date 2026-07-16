/**
 * 管理员手机号登录编排（发码 / 验码）。
 * 仅允许配置的管理员手机号；验证成功后由调用方签发 admin_session。
 */
import { isAliyunSmsConfigured, sendAliyunSms } from "@/lib/admin-phone-login/aliyun-sms"
import {
  canResend,
  consumeOtp,
  generateOtpCode,
  getResendCooldownMs,
  saveOtp,
} from "@/lib/admin-phone-login/otp-store"
import {
  getConfiguredAdminPhone,
  isAdminPhone,
  isValidCnMobile,
  maskPhone,
  normalizePhone,
} from "@/lib/admin-phone-login/phone"
import { getAdminAccessKey } from "@/lib/server-env"

export type PhoneLoginErrorCode =
  | "ADMIN_KEY_NOT_CONFIGURED"
  | "SMS_NOT_CONFIGURED"
  | "ADMIN_PHONE_NOT_CONFIGURED"
  | "INVALID_PHONE"
  | "PHONE_NOT_ALLOWED"
  | "RESEND_TOO_FAST"
  | "SMS_SEND_FAILED"
  | "INVALID_CODE"
  | "CODE_EXPIRED"
  | "CODE_LOCKED"
  | "CODE_MISSING"

export type PhoneLoginErr = { ok: false; status: number; code: PhoneLoginErrorCode; message: string }

export type SendCodeOk = {
  ok: true
  maskedPhone: string
  cooldownSec: number
  /** 仅 DEV_SMS_MODE=1 时返回，便于本地联调 */
  devCode?: string
}

export type VerifyCodeOk = { ok: true; phone: string }

function fail(status: number, code: PhoneLoginErrorCode, message: string): PhoneLoginErr {
  return { ok: false, status, code, message }
}

export function isAdminPhoneLoginConfigured(): boolean {
  return Boolean(getAdminAccessKey()) && isAliyunSmsConfigured() && Boolean(getConfiguredAdminPhone())
}

export async function sendAdminPhoneLoginCode(opts: {
  phone: string
  ip: string
}): Promise<SendCodeOk | PhoneLoginErr> {
  if (!getAdminAccessKey()) {
    return fail(503, "ADMIN_KEY_NOT_CONFIGURED", "未配置后台访问密钥")
  }
  if (!isAliyunSmsConfigured()) {
    return fail(503, "SMS_NOT_CONFIGURED", "未配置阿里云短信，请设置签名与模板")
  }
  if (!getConfiguredAdminPhone()) {
    return fail(503, "ADMIN_PHONE_NOT_CONFIGURED", "未配置管理员手机号（ADMIN_PHONE 或 ADMIN_LOGIN_NAME）")
  }

  const phone = normalizePhone(opts.phone)
  if (!isValidCnMobile(phone)) {
    return fail(400, "INVALID_PHONE", "请输入正确的11位手机号")
  }
  if (!isAdminPhone(phone)) {
    return fail(403, "PHONE_NOT_ALLOWED", "该手机号无权登录管理后台")
  }

  const cooldown = canResend(phone)
  if (!cooldown.ok) {
    return fail(429, "RESEND_TOO_FAST", `请 ${cooldown.waitSec} 秒后再获取验证码`)
  }

  const code = generateOtpCode()
  const sent = await sendAliyunSms({ phone, code })
  if (!sent.ok) {
    return fail(502, "SMS_SEND_FAILED", sent.message || "短信发送失败")
  }

  saveOtp(phone, code)

  const result: SendCodeOk = {
    ok: true,
    maskedPhone: maskPhone(phone),
    cooldownSec: Math.ceil(getResendCooldownMs() / 1000),
  }
  if (sent.mode === "dev") {
    result.devCode = code
  }
  return result
}

export function verifyAdminPhoneLoginCode(opts: {
  phone: string
  code: string
}): VerifyCodeOk | PhoneLoginErr {
  if (!getAdminAccessKey()) {
    return fail(503, "ADMIN_KEY_NOT_CONFIGURED", "未配置后台访问密钥")
  }
  if (!getConfiguredAdminPhone()) {
    return fail(503, "ADMIN_PHONE_NOT_CONFIGURED", "未配置管理员手机号")
  }

  const phone = normalizePhone(opts.phone)
  const code = String(opts.code || "").trim()
  if (!isValidCnMobile(phone)) {
    return fail(400, "INVALID_PHONE", "请输入正确的11位手机号")
  }
  if (!/^\d{4,8}$/.test(code)) {
    return fail(400, "INVALID_CODE", "请输入短信验证码")
  }
  if (!isAdminPhone(phone)) {
    return fail(403, "PHONE_NOT_ALLOWED", "该手机号无权登录管理后台")
  }

  const consumed = consumeOtp(phone, code)
  if (!consumed.ok) {
    if (consumed.reason === "expired") {
      return fail(400, "CODE_EXPIRED", "验证码已过期，请重新获取")
    }
    if (consumed.reason === "locked") {
      return fail(429, "CODE_LOCKED", "验证失败次数过多，请重新获取验证码")
    }
    if (consumed.reason === "missing") {
      return fail(400, "CODE_MISSING", "请先获取短信验证码")
    }
    return fail(403, "INVALID_CODE", "验证码错误")
  }

  return { ok: true, phone }
}
