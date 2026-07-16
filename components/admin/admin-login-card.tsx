"use client"

import * as React from "react"
import { ShieldCheck, Smartphone } from "lucide-react"

import { AdminPasswordLoginPanel } from "@/components/admin/admin-password-login-panel"
import { AdminPhoneLoginPanel } from "@/components/admin/admin-phone-login-panel"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

type Props = {
  onSuccess: () => void | Promise<void>
}

export function AdminLoginCard({ onSuccess }: Props) {
  const [tab, setTab] = React.useState<"password" | "phone">("password")

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {tab === "phone" ? (
            <Smartphone className="h-5 w-5 text-blue-600" />
          ) : (
            <ShieldCheck className="h-5 w-5 text-blue-600" />
          )}
          管理员登录
        </CardTitle>
        <CardDescription>
          {tab === "phone"
            ? "使用管理员手机号接收短信验证码，验证通过后可进入后台。"
            : "请输入管理员账号与密码，验证通过后才可生成兑换码。"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={tab} onValueChange={(v) => setTab(v as "password" | "phone")}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="password">账号密码</TabsTrigger>
            <TabsTrigger value="phone">手机验证码</TabsTrigger>
          </TabsList>
          <TabsContent value="password" className="mt-4">
            <AdminPasswordLoginPanel onSuccess={onSuccess} />
          </TabsContent>
          <TabsContent value="phone" className="mt-4">
            <AdminPhoneLoginPanel onSuccess={onSuccess} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
