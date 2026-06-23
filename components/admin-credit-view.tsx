"use client"

import * as React from "react"
import { ArrowLeft, CheckCircle2, Loader2, LogOut, ShieldCheck, TicketPercent, WandSparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { Batch } from "@/lib/credit-types"

const AMOUNTS = [5000, 8000, 10000, 20000, 30000]

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false })
}

export function AdminCreditView() {
  const router = useRouter()
  const [accessKey, setAccessKey] = React.useState("")
  const [verified, setVerified] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
  const [amount, setAmount] = React.useState("5000")
  const [count, setCount] = React.useState("10")
  const [batches, setBatches] = React.useState<Batch[]>([])
  const [generating, setGenerating] = React.useState(false)

  const loadBatches = React.useCallback(async () => {
    const res = await fetch("/api/credit/redeem-codes", { credentials: "include" })
    if (res.status === 403 || res.status === 503) return { unauthorized: true }
    if (!res.ok) return { unauthorized: false }
    const data = await res.json().catch(() => ({}))
    setBatches(data.batches ?? [])
    return { unauthorized: false }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const result = await loadBatches()
      if (cancelled) return
      if (result && !result.unauthorized) setVerified(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loadBatches])

  const verify = async () => {
    if (!accessKey.trim()) {
      toast.error("请输入管理员密钥")
      return
    }
    setVerifying(true)
    try {
      const res = await fetch("/api/credit/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ access_key: accessKey }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "验证失败")
      setVerified(true)
      toast.success("管理员验证成功")
      await loadBatches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证失败")
    } finally {
      setVerifying(false)
    }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await fetch("/api/credit/redeem-codes/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ amount: Number(amount), count: Number(count), note: "管理员后台生成" }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "生成失败")
      toast.success(`已生成 ${data.count} 个兑换码`)
      await loadBatches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/credit/admin/logout", { method: "POST", credentials: "include" })
    } catch {
      // 忽略错误：清掉本地状态即可
    }
    setVerified(false)
    setAccessKey("")
    setBatches([])
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card className="rounded-3xl border-blue-200 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 p-2 text-white">
          <CardHeader>
            <Badge className="w-fit bg-white/15 text-white hover:bg-white/15">管理员独立页</Badge>
            <CardTitle className="text-3xl">后台兑换码管理中心</CardTitle>
            <CardDescription className="text-white/75">
              这里集成管理员密钥验证、不同额度兑换码生成与批次查看。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="secondary" onClick={() => router.push("/") }>
              <ArrowLeft className="h-4 w-4" /> 返回前台
            </Button>
            {verified ? (
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4" /> 退出登录
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {!verified ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-blue-600" />验证密钥</CardTitle>
              <CardDescription>请输入后台访问密钥，验证通过后才可生成兑换码。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-key">管理员密钥</Label>
                <Input id="admin-key" type="password" value={accessKey} onChange={(e) => setAccessKey(e.target.value)} />
              </div>
              <Button onClick={verify} disabled={verifying}>
                {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} 验证并进入
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {verified ? (
          <>
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><WandSparkles className="h-5 w-5 text-blue-600" />生成不同额度兑换码</CardTitle>
                <CardDescription>支持 5000 / 8000 / 10000 / 20000 / 30000 积分兑换码。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_140px_auto]">
                <div className="space-y-2">
                  <Label>兑换额度</Label>
                  <Select value={amount} onValueChange={setAmount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{AMOUNTS.map((a) => <SelectItem key={a} value={String(a)}>{formatPoints(a)} 积分</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count">数量</Label>
                  <Input id="count" value={count} onChange={(e) => setCount(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={generate} disabled={generating}>
                    {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <TicketPercent className="h-4 w-4" />} 生成
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>批次查看</CardTitle>
                <CardDescription>查看已生成批次的数量、已兑换与可用情况。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-5 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
                    <span>批次</span><span>额度</span><span>总数</span><span>已兑换 / 可用</span><span>创建时间</span>
                  </div>
                  {batches.map((batch) => (
                    <div key={`${batch.batch_id}-${batch.amount}`} className="grid grid-cols-5 border-t px-4 py-3 text-sm">
                      <span className="truncate font-mono text-xs">{batch.batch_id}</span>
                      <span>{formatPoints(batch.amount)}</span>
                      <span>{batch.total}</span>
                      <span>{batch.redeemed_count} / {batch.active_count}</span>
                      <span className="text-muted-foreground">{formatTime(batch.created_at)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </main>
  )
}
