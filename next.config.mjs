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
  experimental: {
    serverActions: {
      bodySizeLimit: "30mb",
    },
  },
}

export default nextConfig
