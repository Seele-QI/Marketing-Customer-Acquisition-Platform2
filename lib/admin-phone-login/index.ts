/**
 * 管理员手机号登录专设模块。
 * - phone：号码规范化 / 白名单
 * - otp-store：验证码存储与限流
 * - aliyun-sms：阿里云 Dysmsapi 发送
 * - service：发码 / 验码编排
 */
export {
  isAliyunSmsConfigured,
  isDevSmsMode,
  readAliyunSmsConfig,
  sendAliyunSms,
} from "@/lib/admin-phone-login/aliyun-sms"
export {
  __resetOtpStoreForTests,
  canResend,
  consumeOtp,
  generateOtpCode,
  saveOtp,
} from "@/lib/admin-phone-login/otp-store"
export {
  getConfiguredAdminPhone,
  isAdminPhone,
  isValidCnMobile,
  maskPhone,
  normalizePhone,
} from "@/lib/admin-phone-login/phone"
export {
  isAdminPhoneLoginConfigured,
  sendAdminPhoneLoginCode,
  verifyAdminPhoneLoginCode,
} from "@/lib/admin-phone-login/service"
export type {
  PhoneLoginErr,
  PhoneLoginErrorCode,
  SendCodeOk,
  VerifyCodeOk,
} from "@/lib/admin-phone-login/service"
