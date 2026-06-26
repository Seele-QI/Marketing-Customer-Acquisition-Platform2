/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    unoptimized: true,
  },
  // Exclude Remotion native packages from Turbopack bundling
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
  ],
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
}

export default nextConfig
