import { CUSTOMER_ERROR_MESSAGES } from "@/lib/api/customer-network-error"

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

function sanitizeEnvValue(raw: unknown): string {
  if (typeof raw !== "string") return ""
  let s = stripBom(raw).trim()
  if (s.length >= 2) {
    const a = s[0]
    const b = s[s.length - 1]
    if ((a === `"` && b === `"`) || (a === `'` && b === `'`)) {
      s = s.slice(1, -1).trim()
    }
  }
  return s
}

function normalizeBase(raw: string): string {
  return raw.replace(/\/+$/, "")
}

const DEV_FASTAPI_DEFAULT = "http://127.0.0.1:8000"

/**
 * 浏览器 / 客户端直连 FastAPI 的公网基址（视频 static、少数未走 Next 代理的 fetch）。
 * 生产 Docker/PaaS：设为 https://api.你的域名.com
 */
export function getFastapiBase(): string {
  const raw = sanitizeEnvValue(process.env.NEXT_PUBLIC_FASTAPI_URL)
  if (raw.length > 0) return normalizeBase(raw)
  if (process.env.NODE_ENV === "production") return ""
  return DEV_FASTAPI_DEFAULT
}

/**
 * Next.js 服务端 proxyToFastapi / withAuth 用的内网基址。
 * 生产 Docker/PaaS：设为 http://api:8000（勿暴露给浏览器）。
 * 未设置时回退 NEXT_PUBLIC_FASTAPI_URL，再回退本地默认。
 */
export function getServerFastapiBase(): string {
  const serverRaw = sanitizeEnvValue(process.env.FASTAPI_URL)
  if (serverRaw.length > 0) return normalizeBase(serverRaw)
  const publicRaw = sanitizeEnvValue(process.env.NEXT_PUBLIC_FASTAPI_URL)
  if (publicRaw.length > 0) return normalizeBase(publicRaw)
  if (process.env.NODE_ENV === "production") return ""
  return DEV_FASTAPI_DEFAULT
}

/**
 * 云端业务 API（账号 / 积分 / 权限）。桌面 prod 注入 CLOUD_API_URL；
 * 未设置时回退 FASTAPI_URL（Zeabur web 内网或本地 dev）。
 */
export function getCloudApiBase(): string {
  const raw = sanitizeEnvValue(process.env.CLOUD_API_URL)
  if (raw.length > 0) return normalizeBase(raw)
  return getServerFastapiBase()
}

function isCloudApiConfigured(): boolean {
  return sanitizeEnvValue(process.env.CLOUD_API_URL).length > 0
}

export type ClientServiceErrorCategory = "local_service" | "cloud_service" | "timeout"

export function getCloudApiServiceErrorCategory(): "local_service" | "cloud_service" {
  return isCloudApiConfigured() ? "cloud_service" : "local_service"
}

/** Node fetch(undici) 不支持转发的 hop-by-hop / 特殊请求头 */
const PROXY_STRIP_HEADERS = [
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "expect",
  "content-length",
] as const

function clientServiceErrorHeaders(
  category: ClientServiceErrorCategory,
): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "X-Client-Service-Error": category,
  }
}

export function createServiceUnavailableResponse(
  category: "local_service" | "cloud_service",
): Response {
  const cloud = category === "cloud_service"
  return new Response(
    JSON.stringify({
      detail: {
        code: cloud ? "CLOUD_SERVICE_UNAVAILABLE" : "LOCAL_SERVICE_UNAVAILABLE",
        message: cloud
          ? CUSTOMER_ERROR_MESSAGES.cloudUnavailable
          : CUSTOMER_ERROR_MESSAGES.localUnavailable,
      },
    }),
    { status: 503, headers: clientServiceErrorHeaders(category) },
  )
}

/**
 * 上游代理超时：避免 Next→FastAPI 黑洞导致请求永不返回。
 * 异步视频 submit/status 通常秒级返回；GEO CRUD 也远低于此值。
 * 可用 FASTAPI_PROXY_TIMEOUT_MS 覆盖（毫秒）。
 */
const DEFAULT_PROXY_TIMEOUT_MS = 60_000

function getProxyTimeoutMs(): number {
  const raw = sanitizeEnvValue(process.env.FASTAPI_PROXY_TIMEOUT_MS)
  if (!raw) return DEFAULT_PROXY_TIMEOUT_MS
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_PROXY_TIMEOUT_MS
}

function isAbortOrTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return err.name === "AbortError" || err.name === "TimeoutError"
}

function buildProxyHeaders(req: Request): Headers {
  const headers = new Headers(req.headers)
  for (const name of PROXY_STRIP_HEADERS) {
    headers.delete(name)
  }
  return headers
}

export async function proxyToFastapi(req: Request, path: string): Promise<Response> {
  return proxyToBase(req, path, getServerFastapiBase(), "FASTAPI_UNAVAILABLE", CUSTOMER_ERROR_MESSAGES.localUnavailable)
}

export async function proxyToFastapiWithTimeout(req: Request, path: string, timeoutMs: number): Promise<Response> {
  return proxyToBase(req, path, getServerFastapiBase(), "FASTAPI_UNAVAILABLE", CUSTOMER_ERROR_MESSAGES.localUnavailable, timeoutMs)
}

export async function proxyToCloudApi(req: Request, path: string): Promise<Response> {
  const base = getCloudApiBase()
  const message = isCloudApiConfigured()
    ? CUSTOMER_ERROR_MESSAGES.cloudUnavailable
    : CUSTOMER_ERROR_MESSAGES.localUnavailable
  return proxyToBase(req, path, base, "CLOUD_API_UNAVAILABLE", message)
}

async function proxyToBase(
  req: Request,
  path: string,
  base: string,
  unavailableCode: string,
  proxyFailedMessage: string,
  timeoutOverrideMs?: number,
): Promise<Response> {
  if (!base) {
    return new Response(
      JSON.stringify({
        detail: {
          code: unavailableCode,
          message: unavailableCode.startsWith("CLOUD_")
            ? CUSTOMER_ERROR_MESSAGES.cloudUnavailable
            : CUSTOMER_ERROR_MESSAGES.localUnavailable,
        },
      }),
      {
        status: 503,
        headers: clientServiceErrorHeaders(
          unavailableCode.startsWith("CLOUD_") ? "cloud_service" : "local_service",
        ),
      },
    )
  }
  const url = new URL(path, base.endsWith("/") ? base : base + "/").toString()
  const headers = buildProxyHeaders(req)
  const timeoutMs = timeoutOverrideMs && timeoutOverrideMs > 0 ? timeoutOverrideMs : getProxyTimeoutMs()
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(timeoutMs),
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
  }
  try {
    const upstream = await fetch(url, init)
    const respHeaders = new Headers(upstream.headers)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  } catch (err) {
    const cause =
      err instanceof Error && "cause" in err && err.cause instanceof Error
        ? err.cause.message
        : err instanceof Error
          ? err.message
          : String(err)
    console.error("[fastapi-proxy-error]", cause)
    const message = isAbortOrTimeout(err)
      ? CUSTOMER_ERROR_MESSAGES.timeout
      : proxyFailedMessage
    return new Response(
      JSON.stringify({
        detail: {
          code: isAbortOrTimeout(err) ? "FASTAPI_PROXY_TIMEOUT" : "FASTAPI_PROXY_FAILED",
          message,
        },
      }),
      {
        status: 503,
        headers: clientServiceErrorHeaders(
          isAbortOrTimeout(err)
            ? "timeout"
            : unavailableCode.startsWith("CLOUD_") ? "cloud_service" : "local_service",
        ),
      },
    )
  }
}

/** 转发 multipart/form-data（manual-upload 等）。 */
export async function proxyMultipartToFastapi(req: Request, path: string): Promise<Response> {
  const base = getServerFastapiBase()
  if (!base) {
    return new Response(
      JSON.stringify({
        detail: { code: "FASTAPI_UNAVAILABLE", message: CUSTOMER_ERROR_MESSAGES.localUnavailable },
      }),
      { status: 503, headers: clientServiceErrorHeaders("local_service") },
    )
  }
  const url = new URL(path, base.endsWith("/") ? base : base + "/").toString()
  const headers = buildProxyHeaders(req)
  // Keep the original multipart boundary and byte stream intact. Rebuilding a
  // FormData body while forwarding the original content-type leaves FastAPI
  // with a boundary that does not exist in the body.
  headers.delete("content-length")
  const timeoutMs = getProxyTimeoutMs()
  try {
    if (!req.body) {
      return new Response(
        JSON.stringify({ detail: { code: "EMPTY_UPLOAD_BODY", message: "上传内容为空" } }),
        { status: 400, headers: { "content-type": "application/json; charset=utf-8" } },
      )
    }
    const body = await req.arrayBuffer()
    const init: RequestInit = {
      method: req.method,
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    }
    const upstream = await fetch(url, init)
    const respHeaders = new Headers(upstream.headers)
    return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
  } catch (err) {
    const cause =
      err instanceof Error && "cause" in err && err.cause instanceof Error
        ? err.cause.message
        : err instanceof Error
          ? err.message
          : String(err)
    console.error("[fastapi-proxy-error]", cause)
    const message = isAbortOrTimeout(err)
      ? CUSTOMER_ERROR_MESSAGES.timeout
      : CUSTOMER_ERROR_MESSAGES.localUnavailable
    return new Response(
      JSON.stringify({
        detail: {
          code: isAbortOrTimeout(err) ? "FASTAPI_PROXY_TIMEOUT" : "FASTAPI_PROXY_FAILED",
          message,
        },
      }),
      {
        status: 503,
        headers: clientServiceErrorHeaders(isAbortOrTimeout(err) ? "timeout" : "local_service"),
      },
    )
  }
}

/** 将当前请求的 query string 拼到 FastAPI path 后。 */
export function fastapiPathWithQuery(req: Request, path: string): string {
  const q = new URL(req.url).search
  return q ? `${path}${q}` : path
}
