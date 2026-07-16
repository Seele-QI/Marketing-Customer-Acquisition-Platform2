"use client"

import { Coins, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useLoginRequired } from "@/components/auth/login-required-provider"
import { formatCreditPoints } from "@/lib/credit/balance-sync"

export function CreditBadge() {
  const { me, balance, promptLogin } = useLoginRequired()

  if (me === undefined) {
    return (
      <div className="flex h-9 w-24 items-center justify-center text-xs text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    )
  }

  if (me === null) {
    return (
      <Button variant="outline" size="sm" onClick={() => promptLogin("登录后可查看积分余额")}>
        登录
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-sm">
      <Coins className="h-3.5 w-3.5 text-amber-500" />
      <span className="font-medium tabular-nums">{formatCreditPoints(balance ?? 0)}</span>
      <span className="text-xs text-muted-foreground">积分</span>
    </div>
  )
}
