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

export function getFastapiBase(): string {
  const raw = sanitizeEnvValue(process.env.NEXT_PUBLIC_FASTAPI_URL)
  if (raw.length > 0) return raw.replace(/\/+$/, "")
  if (process.env.NODE_ENV === "production") return ""
  return "http://127.0.0.1:8000"
}

export async function proxyToFastapi(req: Request, path: string): Promise<Response> {
  const base = getFastapiBase()
  const url = new URL(path, base.endsWith("/") ? base : base + "/").toString()
  const headers = new Headers(req.headers)
  headers.delete("host")
  headers.delete("connection")
  const init: RequestInit = {
    method: req.method,
    headers,
    redirect: "manual",
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text()
  }
  const upstream = await fetch(url, init)
  const respHeaders = new Headers(upstream.headers)
  return new Response(upstream.body, { status: upstream.status, headers: respHeaders })
}
