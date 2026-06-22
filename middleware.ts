import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const SESSION_COOKIE = "session_id"

// 无需登录即可访问的路径（登录页、验证页、公开 API）
const PUBLIC_PATHS = [
  "/login",
  "/api/auth/send-code",
  "/api/auth/verify-code",
  "/api/auth/logout",
  "/api/share/", // 分享落地页公开
]

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p))
}

function isApiRoute(pathname: string): boolean {
  return pathname.startsWith("/api/")
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const hasCookie = !!request.cookies.get(SESSION_COOKIE)?.value

  // API 路由不重定向 — 由后端自行处理认证并返回 401
  if (isApiRoute(pathname)) {
    return NextResponse.next()
  }

  // 未登录 → 公开路径放行，其他页面路由重定向到 /login
  if (!hasCookie && !isPublic(pathname)) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  // 已登录 → /login 重定向到首页
  if (hasCookie && pathname.startsWith("/login")) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - static/ (public static files)
     * - public/ (public directory)
     */
    "/((?!_next/static|_next/image|favicon.ico|static/|public/).*)",
  ],
}
