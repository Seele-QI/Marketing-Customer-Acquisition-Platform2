/**
 * 积分系统共享类型（前端）
 * 后端对应实现：lib/credit.py:list_redeem_code_batches 返回的 dict 结构
 */
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
