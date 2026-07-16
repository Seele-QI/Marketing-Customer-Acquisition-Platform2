/** @type {import('next').NextConfig} */
const nextConfig = {
  // 隐藏左下角 Next.js 开发指示器（Route / Turbopack 面板）
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  // Exclude Remotion native packages from Turbopack bundling
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
    "mammoth",
    "pdf-parse",
  ],
  outputFileTracingIncludes: {
    "/*": [
      "./node_modules/@swc/helpers/**/*",
      "./node_modules/styled-jsx/**/*",
      "./node_modules/@next/env/**/*",
    ],
    "/api/ai/ip-positioning": [
      "./node_modules/pdf-parse/**/*",
      "./node_modules/pdfjs-dist/**/*",
      "./node_modules/@napi-rs/**/*",
      "./node_modules/mammoth/**/*",
    ],
  },
  // 独立输出模式：构建产物只包含运行所需的最小依赖，
  // 配合 Dockerfile 的多阶段构建，把镜像从 ~800MB 缩到 ~300MB。
  // 详见 docs/superpowers/specs/*standalone-deployment.md
  output: "standalone",
  // Electron BrowserWindow 用 127.0.0.1 而非 localhost 加载，
  // Next.js 默认阻止跨域 dev 资源请求（HMR、静态资源），需要显式允许。
  // prod 的 next start 不受影响（不走 dev 的 webpack-hmr 通道）。
  allowedDevOrigins: ['127.0.0.1'],
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ]
  },
  /**
   * 桌面 Electron / Docker：/static/* 由 FastAPI 提供，浏览器经 Next 同源代理到 uvicorn。
   * FASTAPI_URL 在 Electron 子进程启动时注入（如 http://127.0.0.1:8010）。
   */
  async rewrites() {
    const apiBase = (
      process.env.FASTAPI_URL ||
      process.env.NEXT_PUBLIC_FASTAPI_URL ||
      "http://127.0.0.1:8010"
    ).replace(/\/$/, "")
    return [
      {
        source: "/static/video-postprocess/:path*",
        destination: `${apiBase}/static/video-postprocess/:path*`,
      },
      {
        source: "/static/video-generated/:path*",
        destination: `${apiBase}/static/video-generated/:path*`,
      },
    ]
  },
}

export default nextConfig
