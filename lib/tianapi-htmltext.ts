/**
 * 天行 API 网页正文抓取（htmltext）
 * 复用 TIANAPI_KEY（与热搜同一账号体系）
 */

export const HTMLTEXT_MAX_CONTENT_CHARS = 6000
export const HTMLTEXT_MAX_URLS = 5
export const HTMLTEXT_PROMPT_BUDGET = 16_000

export type HtmlTextPage = {
  url: string
  title: string
  content: string
  picture?: string
  ctime?: string
}

export class TianapiHtmlTextError extends Error {
  readonly code: number
  readonly statusCode: number

  constructor(message: string, code: number, statusCode = 502) {
    super(message)
    this.name = "TianapiHtmlTextError"
    this.code = code
    this.statusCode = statusCode
  }
}

const ERROR_MESSAGES: Record<number, string> = {
  100: "天行服务内部错误，请稍后重试",
  110: "网页抓取接口已下线",
  120: "网页抓取接口维护中",
  130: "调用频率超限，请稍后重试",
  140: "接口或密钥无权限，请检查天行控制台",
  150: "API 可用次数不足，请在天行控制台充值天豆",
  160: "当前账号未申请网页正文抓取接口",
  170: "Referer 请求来源受限",
  180: "IP 请求来源受限",
  190: "API 密钥不可用",
  230: "API 密钥无效，请检查 TIANAPI_KEY",
  240: "缺少 API 密钥参数",
  250: "网页正文返回为空，请检查链接是否可公开访问",
  260: "参数值不得为空",
  270: "参数值不符合要求（请检查 URL 格式）",
  280: "缺少必要参数",
  290: "超过最大输入限制",
}

function getApiKey(): string {
  const key = (process.env.TIANAPI_KEY ?? "").trim()
  if (!key) {
    throw new TianapiHtmlTextError("未配置 TIANAPI_KEY，请在 .env 中设置后重启", 240, 503)
  }
  return key
}

function mapError(code: number, msg?: string): TianapiHtmlTextError {
  const known = ERROR_MESSAGES[code]
  const message = known || msg || `网页抓取失败（code ${code}）`
  const statusCode = code === 240 || code === 230 || code === 190 ? 503 : code === 150 ? 402 : 502
  return new TianapiHtmlTextError(message, code, statusCode)
}

function normalizeUrl(raw: string): string {
  const url = raw.trim()
  if (!url) {
    throw new TianapiHtmlTextError("URL 不能为空", 260, 400)
  }
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new TianapiHtmlTextError("URL 格式无效", 270, 400)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new TianapiHtmlTextError("仅支持 http/https 链接", 270, 400)
  }
  return parsed.toString()
}

type TianapiResponse = {
  code?: number
  msg?: string
  result?: {
    ctime?: string
    title?: string
    content?: string
    picture?: string
  } | null
}

/**
 * 根据 URL 抓取网页正文（计费接口，成功 code=200）
 * 单次请求返回，无轮询。
 */
export async function fetchHtmlText(url: string): Promise<HtmlTextPage> {
  const key = getApiKey()
  const target = normalizeUrl(url)

  const body = new URLSearchParams({ key, url: target })
  let res: Response
  try {
    res = await fetch("https://apis.tianapi.com/htmltext/index", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "网络请求失败"
    throw new TianapiHtmlTextError(`网页抓取请求失败：${message}`, 100, 502)
  }

  let data: TianapiResponse
  try {
    data = (await res.json()) as TianapiResponse
  } catch {
    throw new TianapiHtmlTextError(`天行接口响应非 JSON（HTTP ${res.status}）`, 100, 502)
  }

  const code = typeof data.code === "number" ? data.code : -1
  if (code !== 200) {
    throw mapError(code, data.msg)
  }

  const result = data.result
  const content = String(result?.content ?? "").trim()
  if (!content) {
    throw mapError(250, data.msg)
  }

  const title = String(result?.title ?? "").trim() || target
  const picture = String(result?.picture ?? "").trim() || undefined
  const ctime = String(result?.ctime ?? "").trim() || undefined

  return {
    url: target,
    title,
    content:
      content.length > HTMLTEXT_MAX_CONTENT_CHARS
        ? `${content.slice(0, HTMLTEXT_MAX_CONTENT_CHARS)}\n…（已截断）`
        : content,
    picture,
    ctime,
  }
}

/** 并发抓取多 URL，单条失败不中断其它 */
export async function fetchHtmlTextMany(
  urls: string[],
): Promise<Array<HtmlTextPage | { url: string; error: string }>> {
  const unique = [...new Set(urls.map((u) => u.trim()).filter(Boolean))].slice(
    0,
    HTMLTEXT_MAX_URLS,
  )
  return Promise.all(
    unique.map(async (url) => {
      try {
        return await fetchHtmlText(url)
      } catch (err) {
        return {
          url,
          error: err instanceof Error ? err.message : "抓取失败",
        }
      }
    }),
  )
}
