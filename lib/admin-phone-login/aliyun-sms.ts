/**
 * 阿里云短信 Dysmsapi SendSms（RPC 签名，无额外 SDK 依赖）。
 * 文档：https://help.aliyun.com/zh/sms/developer-reference/api-dysmsapi-2017-05-25-sendsms
 */
import crypto from "node:crypto"

import { readServerEnv } from "@/lib/server-env"

const ENDPOINT = "https://dysmsapi.aliyuncs.com/"

function percentEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/\+/g, "%20")
    .replace(/\*/g, "%2A")
    .replace(/%7E/g, "~")
}

function iso8601Utc(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z")
}

export type AliyunSmsConfig = {
  accessKeyId: string
  accessKeySecret: string
  signName: string
  templateCode: string
  templateParamKey: string
}

export function readAliyunSmsConfig(): AliyunSmsConfig | null {
  const accessKeyId = readServerEnv("ALIYUN_ACCESS_KEY_ID")
  const accessKeySecret = readServerEnv("ALIYUN_ACCESS_KEY_SECRET")
  const signName = readServerEnv("ALIYUN_SMS_SIGN_NAME")
  const templateCode = readServerEnv("ALIYUN_SMS_TEMPLATE_CODE")
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) return null
  return {
    accessKeyId,
    accessKeySecret,
    signName,
    templateCode,
    templateParamKey: readServerEnv("ALIYUN_SMS_TEMPLATE_PARAM_KEY") || "code",
  }
}

export function isDevSmsMode(): boolean {
  return readServerEnv("DEV_SMS_MODE") === "1"
}

export function isAliyunSmsConfigured(): boolean {
  return isDevSmsMode() || Boolean(readAliyunSmsConfig())
}

function buildSignedQuery(
  params: Record<string, string>,
  accessKeySecret: string,
): string {
  const sortedKeys = Object.keys(params).sort()
  const canonical = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(params[k]!)}`)
    .join("&")
  const stringToSign = `POST&${percentEncode("/")}&${percentEncode(canonical)}`
  const signature = crypto
    .createHmac("sha1", `${accessKeySecret}&`)
    .update(stringToSign)
    .digest("base64")
  return `${canonical}&Signature=${percentEncode(signature)}`
}

export type SendSmsResult =
  | { ok: true; requestId?: string; mode: "aliyun" | "dev" }
  | { ok: false; message: string; code?: string }

export async function sendAliyunSms(opts: {
  phone: string
  code: string
  fetchImpl?: typeof fetch
}): Promise<SendSmsResult> {
  if (isDevSmsMode()) {
    console.warn(`[DEV-SMS] to=${opts.phone} code=${opts.code} (DEV_SMS_MODE=1, not sent)`)
    return { ok: true, mode: "dev" }
  }

  const cfg = readAliyunSmsConfig()
  if (!cfg) {
    return { ok: false, message: "未配置阿里云短信（签名/模板/AccessKey）" }
  }

  const templateParam = JSON.stringify({ [cfg.templateParamKey]: opts.code })
  const common: Record<string, string> = {
    AccessKeyId: cfg.accessKeyId,
    Action: "SendSms",
    Format: "JSON",
    PhoneNumbers: opts.phone,
    RegionId: readServerEnv("ALIYUN_SMS_REGION_ID") || "cn-hangzhou",
    SignName: cfg.signName,
    SignatureMethod: "HMAC-SHA1",
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: "1.0",
    TemplateCode: cfg.templateCode,
    TemplateParam: templateParam,
    Timestamp: iso8601Utc(),
    Version: "2017-05-25",
  }

  const body = buildSignedQuery(common, cfg.accessKeySecret)
  const fetchFn = opts.fetchImpl ?? fetch

  try {
    const res = await fetchFn(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    })
    const data = (await res.json().catch(() => ({}))) as {
      Code?: string
      Message?: string
      RequestId?: string
    }
    if (!res.ok || data.Code !== "OK") {
      return {
        ok: false,
        message: data.Message || `短信发送失败（HTTP ${res.status}）`,
        code: data.Code,
      }
    }
    return { ok: true, requestId: data.RequestId, mode: "aliyun" }
  } catch (err) {
    const message = err instanceof Error ? err.message : "短信发送异常"
    return { ok: false, message }
  }
}
