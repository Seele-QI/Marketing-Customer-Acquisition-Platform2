"use client"

import * as React from "react"
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Loader2,
  LogOut,
  ShieldCheck,
  TicketPercent,
  Users,
  WandSparkles,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import type { AdminUserItem, Batch, RedeemCodeItem } from "@/lib/credit-types"

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
  const [loginName, setLoginName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [verified, setVerified] = React.useState(false)
  const [verifying, setVerifying] = React.useState(false)
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
  const [userSearch, setUserSearch] = React.useState("")
  const [users, setUsers] = React.useState<AdminUserItem[]>([])
  const [usersTotal, setUsersTotal] = React.useState(0)
  const [usersPage, setUsersPage] = React.useState(1)
  const [loadingUsers, setLoadingUsers] = React.useState(false)
  const [adjustOpen, setAdjustOpen] = React.useState(false)
  const [adjustTarget, setAdjustTarget] = React.useState<AdminUserItem | null>(null)
  const [adjustDelta, setAdjustDelta] = React.useState("")
  const [adjustNote, setAdjustNote] = React.useState("")
  const [adjusting, setAdjusting] = React.useState(false)

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

  const loadUsers = React.useCallback(async (page = 1, search = userSearch) => {
    setLoadingUsers(true)
    try {
      const q = new URLSearchParams({
        page: String(page),
        limit: "20",
        search: search.trim(),
      })
      const res = await fetch(`/api/credit/admin/users?${q.toString()}`, { credentials: "include" })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail?.message ?? `加载用户失败（${res.status}）`)
      setUsers((data.items ?? []) as AdminUserItem[])
      setUsersTotal(Number(data.total ?? 0))
      setUsersPage(Number(data.page ?? page))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "加载用户失败")
    } finally {
      setLoadingUsers(false)
    }
  }, [userSearch])

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

  const verify = async () => {
    if (!loginName.trim() || !password) {
      toast.error("请输入管理员账号和密码")
      return
    }
    setVerifying(true)
    try {
      const res = await fetch("/api/credit/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ login_name: loginName.trim(), password }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.detail?.message ?? "验证失败")
      setVerified(true)
      setPassword("")
      toast.success("管理员登录成功")
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

  const openAdjustDialog = (user: AdminUserItem) => {
    setAdjustTarget(user)
    setAdjustDelta("")
    setAdjustNote("")
    setAdjustOpen(true)
  }

  const submitAdjust = async () => {
    if (!adjustTarget) return
    const delta = Number(adjustDelta)
    if (!Number.isFinite(delta) || delta === 0) {
      toast.error("请输入非零的调整金额（正数充值，负数扣减）")
      return
    }
    setAdjusting(true)
    try {
      const res = await fetch("/api/credit/admin/adjust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          user_id: adjustTarget.id,
          delta,
          note: adjustNote.trim() || "管理员调整",
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail?.message ?? "调账失败")
      toast.success(`已调整，当前余额 ${formatPoints(data.balance ?? 0)}`)
      setAdjustOpen(false)
      await loadUsers(usersPage, userSearch)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "调账失败")
    } finally {
      setAdjusting(false)
    }
  }

  const logout = async () => {
    try {
      await fetch("/api/credit/admin/logout", { method: "POST", credentials: "include" })
    } catch {
      // 忽略错误：清掉本地状态即可
    }
    setVerified(false)
    setPassword("")
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

        {!verified ? (
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-blue-600" />
                管理员账号密码验证
              </CardTitle>
              <CardDescription>请输入管理员账号与密码，验证通过后才可生成兑换码。</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="admin-login">管理员账号</Label>
                <Input
                  id="admin-login"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                  autoComplete="off"
                  placeholder="请输入管理员账号"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="admin-password">管理员密码</Label>
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="请输入管理员密码"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void verify()
                  }}
                />
              </div>
              <Button onClick={verify} disabled={verifying}>
                {verifying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}{" "}
                登录并进入
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {verified ? (
          <Tabs
            value={adminTab}
            onValueChange={(v) => {
              const tab = v as "redeem" | "users"
              setAdminTab(tab)
              if (tab === "users") void loadUsers(1, userSearch)
            }}
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
              <Card className="rounded-2xl">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5 text-blue-600" />
                    用户列表
                  </CardTitle>
                  <CardDescription>查看注册用户并手动调整积分（admin_adjust）。</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 md:flex-row">
                    <Input
                      placeholder="搜索账号或邮箱"
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void loadUsers(1, userSearch)
                      }}
                    />
                    <Button variant="outline" onClick={() => void loadUsers(1, userSearch)} disabled={loadingUsers}>
                      {loadingUsers ? <Loader2 className="h-4 w-4 animate-spin" /> : "搜索"}
                    </Button>
                  </div>
                  <div className="overflow-hidden rounded-xl border">
                    <div className="grid grid-cols-6 bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
                      <span>ID</span>
                      <span>账号</span>
                      <span>余额</span>
                      <span>状态</span>
                      <span>注册时间</span>
                      <span>操作</span>
                    </div>
                    {users.length === 0 ? (
                      <div className="border-t px-4 py-6 text-center text-sm text-muted-foreground">
                        {loadingUsers ? "加载中…" : "暂无用户"}
                      </div>
                    ) : (
                      users.map((user) => (
                        <div
                          key={user.id}
                          className="grid grid-cols-6 items-center border-t px-4 py-3 text-sm"
                        >
                          <span>{user.id}</span>
                          <span className="truncate font-mono text-xs">{user.login_name || user.email_masked}</span>
                          <span>{formatPoints(user.balance)}</span>
                          <span>{user.status}</span>
                          <span className="text-muted-foreground">{formatTime(user.created_at)}</span>
                          <Button variant="outline" size="sm" onClick={() => openAdjustDialog(user)}>
                            调账
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>共 {usersTotal} 个用户</span>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={usersPage <= 1 || loadingUsers}
                        onClick={() => void loadUsers(usersPage - 1, userSearch)}
                      >
                        上一页
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={usersPage * 20 >= usersTotal || loadingUsers}
                        onClick={() => void loadUsers(usersPage + 1, userSearch)}
                      >
                        下一页
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>调整积分</DialogTitle>
            <DialogDescription>
              用户 {adjustTarget?.login_name || adjustTarget?.email_masked}（ID {adjustTarget?.id}），当前余额{" "}
              {formatPoints(adjustTarget?.balance ?? 0)}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adjust-delta">调整金额（正数充值，负数扣减）</Label>
              <Input
                id="adjust-delta"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="例如 1000 或 -500"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-note">备注</Label>
              <Textarea
                id="adjust-note"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="管理员调整原因"
              />
            </div>
            <Button onClick={() => void submitAdjust()} disabled={adjusting} className="w-full">
              {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认调整"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  )
}
