import { CUSTOMER_ERROR_MESSAGES } from "@/lib/api/customer-network-error"
import {
  parseApiErrorResponse,
  type ParseApiErrorOptions,
} from "@/lib/api/parse-detail"

export type AccountAuthResponseData = {
  detail?: unknown
  user?: { id: number; email_masked: string; login_name?: string }
  balance?: number
}

export async function parseAccountAuthResponse(
  response: Response,
  options: ParseApiErrorOptions = {},
): Promise<AccountAuthResponseData & { user: NonNullable<AccountAuthResponseData["user"]> }> {
  let data: AccountAuthResponseData
  try {
    data = await response.json() as AccountAuthResponseData
  } catch {
    throw new Error(parseApiErrorResponse(
      response.status,
      {},
      CUSTOMER_ERROR_MESSAGES.generic,
      options,
    ))
  }

  if (!response.ok) {
    throw new Error(parseApiErrorResponse(
      response.status,
      { detail: data?.detail },
      "登录失败",
      options,
    ))
  }
  if (
    !data?.user ||
    typeof data.user.id !== "number" ||
    typeof data.user.email_masked !== "string"
  ) {
    throw new Error(CUSTOMER_ERROR_MESSAGES.generic)
  }
  return data as AccountAuthResponseData & { user: NonNullable<AccountAuthResponseData["user"]> }
}
