export const CUSTOMER_ERROR_MESSAGES = {
  updating: "正在应用最新模型配置，客户端服务通常会在15秒内恢复，请稍后重新操作。",
  updateFailed: "客户端服务更新未完成，请重启程序后再试。",
  localUnavailable: "客户端服务暂时无法连接，请重启程序后再试。",
  cloudUnavailable: "当前网络无法连接云端服务，请检查网络后重试。",
  timeout: "服务器响应较慢，请稍后重试。",
  generic: "请求暂时未完成，请稍后重试。",
} as const

export type FriendlyNetworkErrorCategory =
  | "updating"
  | "update_failed"
  | "local_service"
  | "cloud_service"
  | "timeout"
  | "unknown"

export type ClientErrorReportCategory =
  | "network"
  | "local_service"
  | "cloud_service"
  | "timeout"
  | "unknown"

export type ClientErrorReport = {
  category: ClientErrorReportCategory
  requestPath: string
  status?: number
  timestamp: string
}

export type RecoveryIncidentDeduper = {
  markIfNew: (key: string) => boolean
  clear: (key: string) => void
}

export function createRecoveryIncidentDeduper(): RecoveryIncidentDeduper {
  const seen = new Set<string>()
  return {
    markIfNew(key: string) {
      if (seen.has(key)) return false
      seen.add(key)
      return true
    },
    clear(key: string) {
      seen.delete(key)
    },
  }
}

export function getRecoveryIncidentKey(
  category: FriendlyNetworkErrorCategory,
  runtimeVersion?: string,
): string | null {
  if (category === "update_failed") {
    return `recovery:update_failed:${runtimeVersion ?? "current"}`
  }
  if (category === "local_service") return "recovery:local_service"
  return null
}

type RuntimeState = "idle" | "updating" | "ready" | "failed"

const TECHNICAL_ERROR_PATTERN =
  /failed\s+to\s+fetch|fetch\s+failed|network request failed|econn(?:refused|reset|aborted)|enotfound|eai_again|err_network|net::err_|networkerror|load failed|fastapi_[a-z0-9_]+|socket hang up/i

const TIMEOUT_PATTERN = /timeout|timed out|etimedout|请求超时|连接超时/i

function messageForCategory(category: FriendlyNetworkErrorCategory): string {
  switch (category) {
    case "updating":
      return CUSTOMER_ERROR_MESSAGES.updating
    case "update_failed":
      return CUSTOMER_ERROR_MESSAGES.updateFailed
    case "local_service":
      return CUSTOMER_ERROR_MESSAGES.localUnavailable
    case "cloud_service":
      return CUSTOMER_ERROR_MESSAGES.cloudUnavailable
    case "timeout":
      return CUSTOMER_ERROR_MESSAGES.timeout
    default:
      return CUSTOMER_ERROR_MESSAGES.generic
  }
}

export class FriendlyNetworkError extends Error {
  readonly category: FriendlyNetworkErrorCategory
  readonly requestPath: string
  readonly status?: number

  constructor(
    category: FriendlyNetworkErrorCategory,
    requestPath: string,
    options: { cause?: unknown; status?: number } = {},
  ) {
    super(messageForCategory(category), { cause: options.cause })
    this.name = "FriendlyNetworkError"
    this.category = category
    this.requestPath = requestPath
    this.status = options.status
  }
}

/**
 * Resolved HTTP errors are handled by their request owner after it parses the
 * response. The global layer owns a toast only when fetch itself rejected.
 */
export function shouldShowGlobalNetworkErrorToast(error: FriendlyNetworkError): boolean {
  return error.status === undefined &&
    error.category !== "updating" &&
    error.category !== "update_failed"
}

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim()
  return typeof error === "string" ? error.trim() : ""
}

function isTimeoutError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "TimeoutError") return true
  if (error instanceof Error && error.name === "TimeoutError") return true
  return TIMEOUT_PATTERN.test(errorText(error))
}

function isIntentionalAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError" && !TIMEOUT_PATTERN.test(errorText(error))
}

function resolveUrl(input: RequestInfo | URL | string, origin?: string): URL | null {
  const raw = input instanceof Request ? input.url : input instanceof URL ? input.href : String(input)
  const safeOrigin = origin && origin !== "null" ? origin : "http://electron.local"
  try {
    return new URL(raw, safeOrigin)
  } catch {
    return null
  }
}

function requestPath(input: RequestInfo | URL | string, origin?: string): string {
  const url = resolveUrl(input, origin)
  if (url) return url.pathname.slice(0, 256) || "/"
  const raw = String(input).replace(/[\r\n\t]/g, "").split(/[?#]/, 1)[0]
  return raw.slice(0, 256) || "/"
}

function isLoopbackRequest(input: RequestInfo | URL | string, origin?: string): boolean {
  const url = resolveUrl(input, origin)
  return url !== null && (
    url.hostname === "127.0.0.1" || url.hostname === "localhost" || url.hostname === "::1"
  )
}

function isLocalServiceRequest(
  input: RequestInfo | URL | string,
  origin?: string,
  localServiceOrigins: readonly string[] = [],
): boolean {
  const url = resolveUrl(input, origin)
  if (!url) return true
  const trustedOrigins = origin && origin !== "null"
    ? [origin, ...localServiceOrigins]
    : ["http://electron.local", ...localServiceOrigins]
  return trustedOrigins.some((trustedOrigin) => {
    try {
      return url.origin === new URL(trustedOrigin).origin
    } catch {
      return false
    }
  })
}

type NetworkFailureOptions = {
  runtimeState?: RuntimeState
  origin?: string
  isDesktop?: boolean
  localServiceOrigins?: readonly string[]
}

export function classifyNetworkFailure(
  input: RequestInfo | URL | string,
  error: unknown,
  options: NetworkFailureOptions = {},
): FriendlyNetworkError {
  const path = requestPath(input, options.origin)
  if (options.runtimeState === "updating") {
    return new FriendlyNetworkError("updating", path, { cause: error })
  }
  if (options.runtimeState === "failed") {
    return new FriendlyNetworkError("update_failed", path, { cause: error })
  }
  if (isTimeoutError(error)) {
    return new FriendlyNetworkError("timeout", path, { cause: error })
  }
  const localServiceRequest = isLocalServiceRequest(
    input,
    options.origin,
    options.localServiceOrigins,
  )
  const category = localServiceRequest
    ? options.isDesktop ? "local_service" : "unknown"
    : isLoopbackRequest(input, options.origin)
      ? "unknown"
      : "cloud_service"
  return new FriendlyNetworkError(category, path, { cause: error })
}

export function getCustomerFacingErrorMessage(
  error: unknown,
  fallback: string = CUSTOMER_ERROR_MESSAGES.generic,
): string {
  if (error instanceof FriendlyNetworkError) return error.message
  const text = error instanceof Error ? error.message.trim() : typeof error === "string" ? error.trim() : ""
  if (!text) return fallback
  if (isTimeoutError(error)) return CUSTOMER_ERROR_MESSAGES.timeout
  if (TECHNICAL_ERROR_PATTERN.test(text)) return fallback
  return text
}

function reportCategory(
  category: FriendlyNetworkErrorCategory | ClientErrorReportCategory,
): ClientErrorReportCategory {
  if (category === "updating" || category === "update_failed") return "local_service"
  if (
    category === "network" ||
    category === "local_service" ||
    category === "cloud_service" ||
    category === "timeout"
  ) {
    return category
  }
  return "unknown"
}

function responseErrorCategory(response: Response): FriendlyNetworkErrorCategory | null {
  const value = response.headers.get("x-client-service-error")?.trim().toLowerCase()
  if (value === "local_service" || value === "cloud_service" || value === "timeout") return value
  return null
}

export function createClientErrorReport(input: {
  category: FriendlyNetworkErrorCategory | ClientErrorReportCategory
  requestPath: string
  status?: number
}): ClientErrorReport {
  const path = requestPath(input.requestPath)
  const status = Number.isInteger(input.status) && input.status! >= 100 && input.status! <= 599
    ? input.status
    : undefined
  return {
    category: reportCategory(input.category),
    requestPath: path,
    ...(status ? { status } : {}),
    timestamp: new Date().toISOString(),
  }
}

type FetchTarget = { fetch: typeof fetch }

type FetchGuardOptions = {
  target?: FetchTarget
  origin?: string
  isDesktop?: boolean
  localServiceOrigins?: readonly string[]
  getRuntimeState?: () => RuntimeState
  report?: (payload: ClientErrorReport) => unknown
  onFriendlyError?: (error: FriendlyNetworkError) => void
  onLocalRecovery?: () => void
}

type FetchGuardRegistration = Required<Pick<FetchGuardOptions, "getRuntimeState">> &
  Pick<FetchGuardOptions, "origin" | "isDesktop" | "localServiceOrigins" | "report" | "onFriendlyError" | "onLocalRecovery">

type FetchGuardState = {
  original: typeof fetch
  wrapped: typeof fetch
  registrations: Set<FetchGuardRegistration>
}

const FETCH_GUARD_KEY = Symbol.for("cuocuo-ai.fetch-error-guard")

export function installFetchErrorGuard(options: FetchGuardOptions = {}): () => void {
  const target = (options.target ?? globalThis) as FetchTarget & { [key: symbol]: unknown }
  const registration: FetchGuardRegistration = {
    origin: options.origin,
    isDesktop: options.isDesktop,
    localServiceOrigins: options.localServiceOrigins,
    getRuntimeState: options.getRuntimeState ?? (() => "idle"),
    report: options.report,
    onFriendlyError: options.onFriendlyError,
    onLocalRecovery: options.onLocalRecovery,
  }
  let state = target[FETCH_GUARD_KEY] as FetchGuardState | undefined

  if (!state) {
    const original = target.fetch
    state = {
      original,
      registrations: new Set(),
      wrapped: undefined as unknown as typeof fetch,
    }
    state.wrapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const response = await original.call(target, input, init)
        const currentState = target[FETCH_GUARD_KEY] as FetchGuardState | undefined
        const active = currentState
          ? Array.from(currentState.registrations).at(-1)
          : undefined
        const responseCategory = responseErrorCategory(response)
        if (responseCategory && active) {
          let runtimeState: RuntimeState = "idle"
          try {
            runtimeState = active.getRuntimeState()
          } catch {
            // Diagnostics state must never alter the original response.
          }
          const customerCategory = runtimeState === "failed"
            ? "update_failed"
            : runtimeState === "updating"
              ? "updating"
              : responseCategory === "local_service" && !active.isDesktop
                ? "unknown"
                : responseCategory
          const friendly = new FriendlyNetworkError(
            customerCategory,
            requestPath(input, active.origin),
            { status: response.status },
          )
          if (active.report) {
            const payload = createClientErrorReport(friendly)
            void Promise.resolve(active.report(payload)).catch(() => undefined)
          }
          try {
            active.onFriendlyError?.(friendly)
          } catch {
            // UI notification failures must not alter the original Response.
          }
        } else if (
          response.ok &&
          active?.isDesktop &&
          isLocalServiceRequest(input, active.origin, active.localServiceOrigins)
        ) {
          try {
            active.onLocalRecovery?.()
          } catch {
            // Recovery bookkeeping must never alter a successful response.
          }
        }
        return response
      } catch (cause) {
        if (isIntentionalAbort(cause)) throw cause
        const currentState = target[FETCH_GUARD_KEY] as FetchGuardState | undefined
        const active = currentState
          ? Array.from(currentState.registrations).at(-1)
          : undefined
        let runtimeState: RuntimeState = "idle"
        try {
          runtimeState = active?.getRuntimeState() ?? "idle"
        } catch {
          // A diagnostics callback must never replace the customer-facing fetch error.
        }
        const friendly = classifyNetworkFailure(input, cause, {
          runtimeState,
          origin: active?.origin,
          isDesktop: active?.isDesktop,
          localServiceOrigins: active?.localServiceOrigins,
        })
        if (active?.report) {
          const payload = createClientErrorReport(friendly)
          void Promise.resolve(active.report(payload)).catch(() => undefined)
        }
        try {
          active?.onFriendlyError?.(friendly)
        } catch {
          // UI notification failures must not expose or replace the sanitized error.
        }
        console.error("[client-network-error]", cause)
        throw friendly
      }
    }) as typeof fetch
    target[FETCH_GUARD_KEY] = state
    target.fetch = state.wrapped
  }

  state.registrations.add(registration)
  let active = true
  return () => {
    if (!active) return
    active = false
    const currentState = target[FETCH_GUARD_KEY] as FetchGuardState | undefined
    if (!currentState) return
    currentState.registrations.delete(registration)
    if (currentState.registrations.size === 0) {
      if (target.fetch === currentState.wrapped) target.fetch = currentState.original
      delete target[FETCH_GUARD_KEY]
    }
  }
}

export function isTechnicalErrorMessage(value: unknown): boolean {
  return typeof value === "string" && (
    TECHNICAL_ERROR_PATTERN.test(value) ||
    TIMEOUT_PATTERN.test(value) ||
    /^[A-Z][A-Z0-9_]{2,}$/.test(value.trim())
  )
}
