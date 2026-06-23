"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"

type VerifyResult = { ok: true; email_masked: string } | { ok: false; message: string }

export default function VerifyPage() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get("token")
  const [result, setResult] = useState<VerifyResult | null>(null)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!token || firedRef.current) return
    firedRef.current = true
    fetch("/api/auth/verify-token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
      credentials: "include",
    })
      .then(async (r) => {
        if (r.ok) {
          const data = (await r.json()) as { user: { email_masked: string } }
          setResult({ ok: true, email_masked: data.user.email_masked })
          setTimeout(() => router.push("/"), 1500)
        } else {
          const err = (await r.json().catch(() => null)) as { detail?: { message?: string } } | null
          setResult({ ok: false, message: err?.detail?.message ?? "链接无效" })
        }
      })
      .catch(() => setResult({ ok: false, message: "网络错误" }))
  }, [token, router])

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
          <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
          <h1 className="mb-2 text-lg font-semibold">缺少 token</h1>
          <p className="text-sm text-muted-foreground">链接无效，请回到首页重新发起登录。</p>
          <a href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
            返回首页
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        {result === null && (
          <>
            <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-muted-foreground" />
            <h1 className="mb-2 text-lg font-semibold">正在登录…</h1>
            <p className="text-sm text-muted-foreground">请稍候，正在验证你的登录链接。</p>
          </>
        )}
        {result?.ok && (
          <>
            <CheckCircle2 className="mx-auto mb-4 h-12 w-12 text-green-600" />
            <h1 className="mb-2 text-lg font-semibold">登录成功</h1>
            <p className="text-sm text-muted-foreground">
              已登录 <span className="font-mono">{result.email_masked}</span>，赠送 100 积分。即将跳转到首页…
            </p>
          </>
        )}
        {result && !result.ok && (
          <>
            <XCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
            <h1 className="mb-2 text-lg font-semibold">链接无效或已过期</h1>
            <p className="text-sm text-muted-foreground">{result.message}</p>
            <a href="/" className="mt-6 inline-block rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
              返回首页重新登录
            </a>
          </>
        )}
      </div>
    </div>
  )
}