/**
 * 积分系统共享类型（前端）
 * 后端对应实现：lib/credit.py:list_redeem_code_batches 返回的 dict 结构
 */
export type LedgerItem = {
  id: number
  type: string
  delta: number
  balance_after: number
  ref_id: string
  note: string
  created_at: number
}

export type Batch = {
  batch_id: string
  amount: number
  total: number
  active_count: number
  redeemed_count: number
  created_at: number
}

export type CreditAccount = {
  balance: number
  total_recharged: number
  total_bonus: number
  total_consumed: number
}

export type RedeemResult = {
  ok: boolean
  reason?: string
  amount?: number
}

export type RedeemCodeItem = {
  code: string
  amount: number
  batch_id?: string
  status: "active" | "redeemed"
  redeemed_at?: number | null
}

export type AdminUserItem = {
  id: number
  login_name: string
  email_masked: string
  password?: string
  status: string
  created_at: number
  balance: number
}

export type AdminCreateUserResult = {
  id: number
  login_name: string
  password: string
  balance: number
  status: string
}

export type AdminUserListResponse = {
  items: AdminUserItem[]
  total: number
  page: number
  limit: number
}
