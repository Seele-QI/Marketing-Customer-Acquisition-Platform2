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

function buildProxyHeaders(req: Request): Headers {
  const headers = new Headers(req.headers)
  for (const name of PROXY_STRIP_HEADERS) {
    headers.delete(name)
  }
  return headers
}

export async function proxyToFastapi(req: Request, path: string): Promise<Response> {
  return proxyToBase(req, path, getServerFastapiBase(), "FASTAPI_UNAVAILABLE", "无法连接后端服务，请确认 FastAPI 已启动（pnpm dev:all）")
}

export async function proxyToCloudApi(req: Request, path: string): Promise<Response> {
  return proxyToBase(req, path, getCloudApiBase(), "CLOUD_API_UNAVAILABLE", "无法连接云端服务，请检查 CLOUD_API_URL 或网络")
}

async function proxyToBase(
  req: Request,
  path: string,
  base: string,
  unavailableCode: string,
  proxyFailedMessage: string,
): Promise<Response> {
  if (!base) {
    return new Response(
      JSON.stringify({
        detail: { code: unavailableCode, message: "后端服务未配置" },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }
  const url = new URL(path, base.endsWith("/") ? base : base + "/").toString()
  const headers = buildProxyHeaders(req)
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
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
    return new Response(
      JSON.stringify({
        detail: {
          code: "FASTAPI_PROXY_FAILED",
          message: proxyFailedMessage,
          cause,
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }
}

/** 转发 multipart/form-data（manual-upload 等）。 */
export async function proxyMultipartToFastapi(req: Request, path: string): Promise<Response> {
  const base = getServerFastapiBase()
  if (!base) {
    return new Response(
      JSON.stringify({
        detail: { code: "FASTAPI_UNAVAILABLE", message: "后端服务未配置（请设置 FASTAPI_URL）" },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    )
  }
  const url = new URL(path, base.endsWith("/") ? base : base + "/").toString()
  const headers = buildProxyHeaders(req)
  const formData = await req.formData()
  const upstream = await fetch(url, {
    method: req.method,
    headers,
    body: formData,
    redirect: "manual",
  })
  const respHeaders = new Headers(upstream.headers)
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
}

/** 将当前请求的 query string 拼到 FastAPI path 后。 */
export function fastapiPathWithQuery(req: Request, path: string): string {
  const q = new URL(req.url).search
  return q ? `${path}${q}` : path
}
