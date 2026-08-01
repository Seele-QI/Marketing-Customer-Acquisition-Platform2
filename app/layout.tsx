import type { Metadata } from "next"
import Script from "next/script"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { EditableContextMenu } from "@/components/editable-context-menu"
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from "@/components/ui/sonner"
import { GeoSwitchFlash } from "@/components/geo/geo-switch-flash"
import { THEME_INIT_SCRIPT } from "@/lib/theme-init-script"
import { ServiceRecoveryProvider } from "@/components/service-recovery-provider"
import "./globals.css"

export const metadata: Metadata = {
  title: "招财猫",
  description: "招财猫 — 一站式 AI 创作平台，从身份定位到视频创作，全链路智能驱动。",
  generator: "v0.app",
  icons: {
    icon: "/icon.png",
    apple: "/icon.png",
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className="bg-background">
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body className="font-sans antialiased" suppressHydrationWarning>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <ServiceRecoveryProvider>
            {children}
            <EditableContextMenu />
            <GeoSwitchFlash />
            <Toaster />
            <SonnerToaster />
          </ServiceRecoveryProvider>
        </ThemeProvider>
        {process.env.NODE_ENV === "production" && <Analytics />}
      </body>
    </html>
  )
}
