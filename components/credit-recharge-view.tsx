"use client"

import * as React from "react"
import { CheckCircle2, Coins, Loader2, RefreshCw, TicketPercent, WandSparkles } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import type { CreditAccount, LedgerItem } from "@/lib/credit-types"

type GeneratedCode = {
  code: string
  amount: number
}


function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatTime(ms: number) {
  if (!ms) return "--"
  return new Date(ms).toLocaleString("zh-CN", { hour12: false })
}

function formatLedgerType(type: string) {
  const map: Record<string, string> = {
    register_bonus: "注册赠送",
    redeem: "兑换充值",
    consume: "消费扣减",
    admin_adjust: "管理员调整",
  }
  return map[type] ?? type
}

export function CreditRechargeView() {
  const [balance, setBalance] = React.useState<CreditAccount | null>(null)
  const [code, setCode] = React.useState("")
  const [redeeming, setRedeeming] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [ledger, setLedger] = React.useState<LedgerItem[]>([])

  const refreshBalance = React.useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/credit/balance", { credentials: "include" })
      if (res.status === 401) {
        toast.error("请先登录后再使用积分充值")
        setBalance(null)
        return
      }
      if (!res.ok) throw new Error("余额加载失败")
      setBalance((await res.json()) as CreditAccount)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "余额加载失败")
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshLedger = React.useCallback(async () => {
    try {
      const res = await fetch("/api/credit/ledger?limit=20", { credentials: "include" })
      if (res.status === 401) {
        setLedger([])
        return
      }
      if (!res.ok) return
      const data = (await res.json()) as { items?: LedgerItem[] }
      setLedger(data.items ?? [])
    } catch {
      setLedger([])
    }
  }, [])

  React.useEffect(() => {
    void refreshBalance()
    void refreshLedger()
  }, [refreshBalance, refreshLedger])

  const redeem = async () => {
    const trimmed = code.trim()
    if (!trimmed) {
      toast.error("请输入兑换码")
      return
    }
    setRedeeming(true)
    try {
      const res = await fetch("/api/credit/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: trimmed }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const message = data?.detail?.message ?? data?.detail ?? "兑换失败"
        throw new Error(typeof message === "string" ? message : "兑换失败")
      }
      const amount = data?.result?.amount ?? 0
      toast.success(`兑换成功，已充值 ${formatPoints(amount)} 积分`)
      setCode("")
      await refreshBalance()
      await refreshLedger()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "兑换失败")
    } finally {
      setRedeeming(false)
    }
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <section className="rounded-3xl border bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 p-8 text-white shadow-sm">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-3">
              <Badge className="bg-white/20 text-white hover:bg-white/20">积分系统</Badge>
              <h1 className="text-3xl font-semibold tracking-tight">积分消费与兑换码充值中心</h1>
              <p className="max-w-2xl text-sm text-white/80">
                视频创作按类型扣费：口播 500 积分、图文视频 100 积分、视频混剪 150 积分；大模型对话每次 3 积分。可在此输入兑换码充值。
              </p>
            </div>
            <div className="rounded-2xl bg-white/15 p-5 backdrop-blur">
              <div className="flex items-center gap-2 text-sm text-white/75">
                <Coins className="h-4 w-4" /> 当前余额
              </div>
              <div className="mt-2 text-4xl font-bold tabular-nums">
                {loading ? "--" : formatPoints(balance?.balance ?? 0)}
              </div>
              <div className="mt-1 text-xs text-white/70">积分</div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TicketPercent className="h-5 w-5 text-amber-500" /> 充值兑换
              </CardTitle>
              <CardDescription>输入已登记且未使用的兑换码，成功后积分立即到账。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="redeem-code">兑换码</Label>
                <Input
                  id="redeem-code"
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void redeem()
                  }}
                />
              </div>
              <Button className="w-full" onClick={redeem} disabled={redeeming}>
                {redeeming ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                立即兑换
              </Button>
              <Separator />
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-xl bg-muted p-3">
                  <div className="font-semibold tabular-nums">{formatPoints(balance?.total_recharged ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">累计充值</div>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <div className="font-semibold tabular-nums">{formatPoints(balance?.total_bonus ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">赠送积分</div>
                </div>
                <div className="rounded-xl bg-muted p-3">
                  <div className="font-semibold tabular-nums">{formatPoints(balance?.total_consumed ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">累计消耗</div>
                </div>
              </div>
              <Button variant="outline" className="w-full" onClick={refreshBalance} disabled={loading}>
                <RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} /> 刷新余额
              </Button>
            </CardContent>
          </Card>

          <Card className="rounded-2xl border-blue-200 bg-blue-50/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-700">
                <WandSparkles className="h-5 w-5" /> 后台管理入口
              </CardTitle>
              <CardDescription>使用管理员账号与密码登录后，可生成兑换码并查看批次。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-blue-700/80">
                管理员独立页使用账号密码登录，可生成不同额度兑换码、查看批次并一键复制兑换码。
              </p>
              <Button className="w-full bg-blue-600 hover:bg-blue-700" onClick={() => window.location.href = "/admin/credit"}>
                进入管理员页
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle>最近积分流水</CardTitle>
            <CardDescription>展示最近 20 条充值、赠送与消费记录。</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-xl border">
              <div className="grid grid-cols-5 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
                <span>时间</span>
                <span>类型</span>
                <span>变动</span>
                <span>余额</span>
                <span>备注</span>
              </div>
              {ledger.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">暂无流水记录</div>
              ) : (
                ledger.map((item) => (
                  <div key={item.id} className="grid grid-cols-5 border-t px-4 py-3 text-sm">
                    <span className="text-muted-foreground">{formatTime(item.created_at)}</span>
                    <span>{formatLedgerType(item.type)}</span>
                    <span className={item.delta >= 0 ? "text-emerald-600 tabular-nums" : "text-rose-600 tabular-nums"}>
                      {item.delta >= 0 ? "+" : ""}
                      {formatPoints(item.delta)}
                    </span>
                    <span className="tabular-nums">{formatPoints(item.balance_after)}</span>
                    <span className="truncate text-muted-foreground" title={item.note}>
                      {item.note || item.ref_id || "--"}
                    </span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
