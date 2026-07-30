import { Resolver } from "node:dns/promises"
import https from "node:https"
import type { IncomingHttpHeaders } from "node:http"
import type { LookupAddress } from "node:dns"

const ARK_CHINA_HOST = "ark.cn-beijing.volces.com"
const CHINA_DNS_SERVERS = ["223.5.5.5", "180.76.76.76"] as const
const PRIMARY_ATTEMPT_MAX_MS = 12_000

export function isArkChinaDirectHost(rawUrl: string): boolean {
  try {
    return new URL(rawUrl).hostname.toLowerCase() === ARK_CHINA_HOST
  } catch {
    return false
  }
}

async function resolveArkFromDomesticDns(): Promise<string[]> {
  const addresses: string[] = []
  for (const server of CHINA_DNS_SERVERS) {
    const resolver = new Resolver()
    resolver.setServers([server])
    try {
      for (const address of await resolver.resolve4(ARK_CHINA_HOST)) {
        // 44/8 is the Fake-IP pool observed in the affected TUN setup.
        if (!address.startsWith("44.") && !addresses.includes(address)) {
          addresses.push(address)
        }
      }
    } catch {
      // Try the next mainland DNS resolver.
    }
  }
  if (!addresses.length) throw new Error("国内 DNS 未返回豆包方舟真实地址")
  return addresses
}

function responseHeaders(headers: IncomingHttpHeaders): Headers {
  const result = new Headers()
  for (const [name, value] of Object.entries(headers)) {
    if (Array.isArray(value)) {
      for (const item of value) result.append(name, item)
    } else if (value !== undefined) {
      result.set(name, String(value))
    }
  }
  return result
}

function requestPinned(
  rawUrl: string,
  init: RequestInit,
  address: string,
  signal: AbortSignal,
): Promise<Response> {
  return new Promise((resolve, reject) => {
    const url = new URL(rawUrl)
    const headers = Object.fromEntries(new Headers(init.headers).entries())
    const pinnedLookup = (
      _hostname: string,
      options: unknown,
      callback: (
        error: NodeJS.ErrnoException | null,
        address: string | LookupAddress[],
        family?: number,
      ) => void,
    ) => {
      const wantsAll =
        options !== null &&
        typeof options === "object" &&
        "all" in options &&
        Boolean((options as { all?: unknown }).all)
      if (wantsAll) callback(null, [{ address, family: 4 }])
      else callback(null, address, 4)
    }
    const request = https.request(
      url,
      {
        method: init.method || "GET",
        headers,
        servername: url.hostname,
        lookup: pinnedLookup as never,
      },
      (incoming) => {
        const chunks: Buffer[] = []
        incoming.on("data", (chunk) => chunks.push(Buffer.from(chunk)))
        incoming.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: incoming.statusCode || 502,
              statusText: incoming.statusMessage || "",
              headers: responseHeaders(incoming.headers),
            }),
          )
        })
      },
    )
    const abort = () => request.destroy(signal.reason instanceof Error ? signal.reason : undefined)
    signal.addEventListener("abort", abort, { once: true })
    request.once("error", reject)
    request.once("close", () => signal.removeEventListener("abort", abort))
    if (typeof init.body === "string" || Buffer.isBuffer(init.body)) {
      request.write(init.body)
    } else if (init.body != null) {
      request.destroy(new Error("豆包直连兜底仅支持字符串请求体"))
      return
    }
    request.end()
  })
}

async function fetchPinnedArk(
  rawUrl: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const addresses = await resolveArkFromDomesticDns()
  const errors: string[] = []
  for (const address of addresses) {
    try {
      return await requestPinned(
        rawUrl,
        init,
        address,
        AbortSignal.timeout(Math.max(1_000, timeoutMs)),
      )
    } catch (error) {
      errors.push(`${address}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error(`豆包国内直连失败：${errors.join("；")}`)
}

/**
 * Normal mainland users take the ordinary system-DNS path. If a local DNS/TUN
 * contaminates Ark resolution, retry the same HTTPS request against addresses
 * resolved from AliDNS/Baidu DNS while preserving hostname verification and SNI.
 */
export async function fetchWithChinaDirectFallback(
  rawUrl: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  if (!isArkChinaDirectHost(rawUrl)) {
    return fetchImpl(rawUrl, {
      ...init,
      signal: AbortSignal.timeout(timeoutMs),
    })
  }

  const startedAt = Date.now()
  try {
    return await fetchImpl(rawUrl, {
      ...init,
      signal: AbortSignal.timeout(Math.min(timeoutMs, PRIMARY_ATTEMPT_MAX_MS)),
    })
  } catch (firstError) {
    const remainingMs = Math.max(1_000, timeoutMs - (Date.now() - startedAt))
    try {
      return await fetchPinnedArk(rawUrl, init, remainingMs)
    } catch (fallbackError) {
      const first = firstError instanceof Error ? firstError.message : String(firstError)
      const second = fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
      throw new Error(`常规连接失败：${first}；国内直连兜底失败：${second}`, {
        cause: fallbackError,
      })
    }
  }
}
