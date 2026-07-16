"use client"

import * as React from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

type Props = {
  onSuccess: () => void | Promise<void>
}

export function AdminPasswordLoginPanel({ onSuccess }: Props) {
  const [loginName, setLoginName] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [verifying, setVerifying] = React.useState(false)

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
      toast.success("登录成功")
      await onSuccess()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "验证失败")
    } finally {
      setVerifying(false)
    }
  }

  return (
    <div className="space-y-4">
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
      <Button onClick={() => void verify()} disabled={verifying}>
        {verifying ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}{" "}
        登录并进入
      </Button>
    </div>
  )
}
