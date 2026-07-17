"use client"

import * as React from "react"
import { ArrowLeft, Copy, Loader2, LogOut, TicketPercent, WandSparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

import { AdminLoginCard } from "@/components/admin/admin-login-card"
import { AdminUserManagementPanel } from "@/components/admin/admin-user-management-panel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Batch, RedeemCodeItem } from "@/lib/credit-types"

const AMOUNTS = [5000, 8000, 10000, 20000, 30000]

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false })
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(successMessage)
  } catch {
    toast.error("复制失败，请手动选择复制")
  }
}

export function AdminCreditView() {
  const router = useRouter()
  const [verified, setVerified] = React.useState(false)
  const [amount, setAmount] = React.useState("5000")
  const [count, setCount] = React.useState("10")
  const [batches, setBatches] = React.useState<Batch[]>([])
  const [generating, setGenerating] = React.useState(false)
  const [generatedItems, setGeneratedItems] = React.useState<RedeemCodeItem[]>([])
  const [batchDialogOpen, setBatchDialogOpen] = React.useState(false)
  const [batchDialogId, setBatchDialogId] = React.useState("")
  const [batchItems, setBatchItems] = React.useState<RedeemCodeItem[]>([])
  const [loadingBatchItems, setLoadingBatchItems] = React.useState(false)
  const [adminTab, setAdminTab] = React.useState<"redeem" | "users">("redeem")

  const loadBatches = React.useCallback(async () => {
    const res = await fetch("/api/credit/redeem-codes", { credentials: "include" })
    if (res.status === 403 || res.status === 401 || res.status === 503) {
      return { unauthorized: true }
    }
    if (!res.ok) {
      return { unauthorized: true, error: `加载批次失败（${res.status}）` }
    }
    const data = await res.json().catch(() => ({}))
    setBatches(data.batches ?? [])
    return { unauthorized: false }
  }, [])

  const checkAdminSession = React.useCallback(async () => {
    const res = await fetch("/api/credit/admin/status", { credentials: "include" })
    return res.ok
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      const loggedIn = await checkAdminSession()
      if (cancelled) return
      if (!loggedIn) return
      setVerified(true)
      const result = await loadBatches()
      if (cancelled) return
      if (result?.error) toast.error(result.error)
    })()
    return () => {
      cancelled = true
    }
  }, [checkAdminSession, loadBatches])

  const handleAdminLoginSuccess = React.useCallback(async () => {
    setVerified(true)
    const result = await loadBatches()
    if (result?.error) toast.error(result.error)
  }, [loadBatches])

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
      const items = (data.items ?? []) as RedeemCodeItem[]
      setGeneratedItems(items)
      toast.success(`已生成 ${data.count} 个兑换码`)
      await loadBatches()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败")
    } finally {
      setGenerating(false)
    }
  }

  const openBatchDialog = async (batchId: string) => {
    setBatchDialogId(batchId)
    setBatchDialogOpen(true)
    setLoadingBatchItems(true)
    setBatchItems([])
    try {
      const res = await fetch(
        `/api/credit/redeem-codes/items?batch_id=${encodeURIComponent(batchId)}`,
        { credentials: "include" },
      )
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "加载兑换码失败")
      setBatchItems((data.items ?? []) as RedeemCodeItem[])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载兑换码失败")
      setBatchDialogOpen(false)
    } finally {
      setLoadingBatchItems(false)
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/credit/admin/logout", { method: "POST", credentials: "include" })
    } catch {
      // 忽略错误：清掉本地状态即可
    }
    setVerified(false)
    setBatches([])
    setGeneratedItems([])
  }

  const renderCodeTable = (items: RedeemCodeItem[], title: string) => {
    if (items.length === 0) return null
    const allCodes = items.map((item) => item.code).join("\n")
    return (
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="text-lg">{title}</CardTitle>
            <CardDescription>共 {items.length} 个兑换码</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void copyText(allCodes, "已复制全部兑换码")}>
            <Copy className="h-4 w-4" /> 复制全部
          </Button>
        </CardHeader>
        <CardContent>
          <div className="max-h-80 overflow-y-auto rounded-xl border">
            <div className="grid grid-cols-[1fr_auto_auto] bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
              <span>兑换码</span>
              <span className="px-4">状态</span>
              <span>操作</span>
            </div>
            {items.map((item) => (
              <div
                key={item.code}
                className={`grid grid-cols-[1fr_auto_auto] items-center border-t px-4 py-2 text-sm ${
                  item.status === "redeemed" ? "text-muted-foreground" : ""
                }`}
              >
                <span className="font-mono text-xs">{item.code}</span>
                <span className="px-4 text-xs">
                  {item.status === "redeemed" ? "已兑换" : "可用"}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void copyText(item.code, "已复制兑换码")}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <main className="flex-1 overflow-y-auto bg-muted/20 p-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <Card className="rounded-3xl border-blue-200 bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 p-2 text-white">
          <CardHeader>
            <Badge className="w-fit bg-white/15 text-white hover:bg-white/15">管理员独立页</Badge>
            <CardTitle className="text-3xl">后台管理中心</CardTitle>
            <CardDescription className="text-white/75">
              管理员登录后可管理用户积分、生成兑换码并查看批次。
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-3">
            <Button variant="secondary" onClick={() => router.push("/")}>
              <ArrowLeft className="h-4 w-4" /> 返回前台
            </Button>
            {verified ? (
              <Button variant="outline" onClick={logout}>
                <LogOut className="h-4 w-4" /> 退出登录
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {!verified ? <AdminLoginCard onSuccess={handleAdminLoginSuccess} /> : null}

        {verified ? (
          <Tabs
            value={adminTab}
            onValueChange={(v) => setAdminTab(v as "redeem" | "users")}
          >
            <TabsList>
              <TabsTrigger value="redeem">兑换码</TabsTrigger>
              <TabsTrigger value="users">用户管理</TabsTrigger>
            </TabsList>

            <TabsContent value="redeem" className="mt-6 space-y-6">
            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <WandSparkles className="h-5 w-5 text-blue-600" />
                  生成不同额度兑换码
                </CardTitle>
                <CardDescription>支持 5000 / 8000 / 10000 / 20000 / 30000 积分兑换码。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-[1fr_140px_auto]">
                <div className="space-y-2">
                  <Label>兑换额度</Label>
                  <Select value={amount} onValueChange={setAmount}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {AMOUNTS.map((a) => (
                        <SelectItem key={a} value={String(a)}>
                          {formatPoints(a)} 积分
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="count">数量</Label>
                  <Input id="count" value={count} onChange={(e) => setCount(e.target.value)} />
                </div>
                <div className="flex items-end">
                  <Button onClick={generate} disabled={generating}>
                    {generating ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TicketPercent className="h-4 w-4" />
                    )}{" "}
                    生成
                  </Button>
                </div>
              </CardContent>
            </Card>

            {renderCodeTable(generatedItems, "本次生成结果")}

            <Card className="rounded-2xl">
              <CardHeader>
                <CardTitle>批次查看</CardTitle>
                <CardDescription>查看已生成批次的数量、已兑换与可用情况。</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-hidden rounded-xl border">
                  <div className="grid grid-cols-6 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
                    <span>批次</span>
                    <span>额度</span>
                    <span>总数</span>
                    <span>已兑换 / 可用</span>
                    <span>创建时间</span>
                    <span>操作</span>
                  </div>
                  {batches.length === 0 ? (
                    <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
                      暂无兑换码批次
                    </div>
                  ) : (
                    batches.map((batch) => (
                      <div
                        key={`${batch.batch_id}-${batch.amount}`}
                        className="grid grid-cols-6 items-center border-t px-4 py-3 text-sm"
                      >
                        <span className="truncate font-mono text-xs">{batch.batch_id}</span>
                        <span>{formatPoints(batch.amount)}</span>
                        <span>{batch.total}</span>
                        <span>
                          {batch.redeemed_count} / {batch.active_count}
                        </span>
                        <span className="text-muted-foreground">{formatTime(batch.created_at)}</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void openBatchDialog(batch.batch_id)}
                        >
                          查看兑换码
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
            </TabsContent>

            <TabsContent value="users" className="mt-6 space-y-6">
              <AdminUserManagementPanel active={adminTab === "users"} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>

      <Dialog open={batchDialogOpen} onOpenChange={setBatchDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>批次兑换码</DialogTitle>
            <DialogDescription className="truncate font-mono text-xs">{batchDialogId}</DialogDescription>
          </DialogHeader>
          {loadingBatchItems ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : batchItems.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">暂无兑换码</p>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    void copyText(
                      batchItems.map((item) => item.code).join("\n"),
                      "已复制全部兑换码",
                    )
                  }
                >
                  <Copy className="h-4 w-4" /> 复制全部
                </Button>
              </div>
              <div className="max-h-72 overflow-y-auto rounded-xl border">
                {batchItems.map((item) => (
                  <div
                    key={item.code}
                    className={`flex items-center justify-between border-b px-4 py-2 last:border-b-0 ${
                      item.status === "redeemed" ? "text-muted-foreground" : ""
                    }`}
                  >
                    <div>
                      <div className="font-mono text-xs">{item.code}</div>
                      <div className="text-xs">{item.status === "redeemed" ? "已兑换" : "可用"}</div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => void copyText(item.code, "已复制兑换码")}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </main>
  )
}
