"use client"

import * as React from "react"
import { Loader2, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"

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
import { Textarea } from "@/components/ui/textarea"
import type { AdminUserItem } from "@/lib/credit-types"

function formatPoints(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value)
}

function formatTime(ms: number) {
  return new Date(ms).toLocaleString("zh-CN", { hour12: false })
}

export function AdminUserManagementPanel({ active = true }: { active?: boolean }) {
  const [userSearch, setUserSearch] = React.useState("")
  const [users, setUsers] = React.useState<AdminUserItem[]>([])
  const [usersTotal, setUsersTotal] = React.useState(0)
  const [usersPage, setUsersPage] = React.useState(1)
  const [loadingUsers, setLoadingUsers] = React.useState(false)

  const [createOpen, setCreateOpen] = React.useState(false)
  const [createLoginName, setCreateLoginName] = React.useState("")
  const [createPassword, setCreatePassword] = React.useState("")
  const [creating, setCreating] = React.useState(false)

  const [adjustOpen, setAdjustOpen] = React.useState(false)
  const [adjustTarget, setAdjustTarget] = React.useState<AdminUserItem | null>(null)
  const [adjustDelta, setAdjustDelta] = React.useState("")
  const [adjustNote, setAdjustNote] = React.useState("")
  const [adjusting, setAdjusting] = React.useState(false)

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

  React.useEffect(() => {
    if (!active) return
    void loadUsers(1, "")
  }, [active, loadUsers])

  const openAdjustDialog = (user: AdminUserItem) => {
    setAdjustTarget(user)
    setAdjustDelta("")
    setAdjustNote("")
    setAdjustOpen(true)
  }

  const submitCreate = async () => {
    if (!createLoginName.trim() || !createPassword) {
      toast.error("请输入账号和密码")
      return
    }
    setCreating(true)
    try {
      const res = await fetch("/api/credit/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          login_name: createLoginName.trim(),
          password: createPassword,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.detail?.message ?? "创建失败")
      toast.success(`已创建账号 ${data.login_name ?? createLoginName}`)
      setCreateOpen(false)
      setCreateLoginName("")
      setCreatePassword("")
      await loadUsers(1, userSearch)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "创建失败")
    } finally {
      setCreating(false)
    }
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

  return (
    <>
      <Card className="rounded-2xl">
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              用户列表
            </CardTitle>
            <CardDescription>
              查看账号、密码、余额与注册时间；可手动创建账号或调整积分。历史账号密码显示为「—」。
            </CardDescription>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-4 w-4" />
            创建账号
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder="搜索账号"
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
          <div className="overflow-x-auto rounded-xl border">
            <div className="grid min-w-[640px] grid-cols-[1.2fr_1fr_0.8fr_1.2fr_0.7fr] bg-muted px-4 py-3 text-xs font-medium text-muted-foreground">
              <span>账号</span>
              <span>密码</span>
              <span>余额</span>
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
                  className="grid min-w-[640px] grid-cols-[1.2fr_1fr_0.8fr_1.2fr_0.7fr] items-center border-t px-4 py-3 text-sm"
                >
                  <span className="truncate font-mono text-xs">{user.login_name || user.email_masked}</span>
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {user.password && user.password !== "—" ? user.password : "—"}
                  </span>
                  <span>{formatPoints(user.balance)}</span>
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

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建账号</DialogTitle>
            <DialogDescription>手动创建账号密码，创建后可在列表中查看密码（密码至少 8 位）。</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-login-name">账号</Label>
              <Input
                id="create-login-name"
                value={createLoginName}
                onChange={(e) => setCreateLoginName(e.target.value)}
                placeholder="手机号或英文账号"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="create-password">密码</Label>
              <Input
                id="create-password"
                type="text"
                value={createPassword}
                onChange={(e) => setCreatePassword(e.target.value)}
                placeholder="至少 8 位"
                autoComplete="new-password"
              />
            </div>
            <Button onClick={() => void submitCreate()} disabled={creating} className="w-full">
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整积分</DialogTitle>
            <DialogDescription>
              用户：{adjustTarget?.login_name || adjustTarget?.email_masked}（当前余额{" "}
              {formatPoints(adjustTarget?.balance ?? 0)}）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adjust-delta">调整金额</Label>
              <Input
                id="adjust-delta"
                inputMode="numeric"
                value={adjustDelta}
                onChange={(e) => setAdjustDelta(e.target.value)}
                placeholder="正数充值，负数扣减"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adjust-note">备注</Label>
              <Textarea
                id="adjust-note"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
                placeholder="可选"
                rows={2}
              />
            </div>
            <Button onClick={() => void submitAdjust()} disabled={adjusting} className="w-full">
              {adjusting ? <Loader2 className="h-4 w-4 animate-spin" /> : "确认调整"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
