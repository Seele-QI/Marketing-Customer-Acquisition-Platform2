/**
 * 服务端环境变量读取（Route Handlers / Server Actions）。
 * 兼容控制台里误加引号、UTF-8 BOM 等常见配置问题。
 */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s
}

export function readServerEnv(name: string): string {
  const raw = process.env[name]
  if (typeof raw !== "string") return ""
  let s = stripBom(raw).trim()
  if (s.length >= 2) {
    const a = s[0]
    const b = s[s.length - 1]
    if ((a === '"' && b === '"') || (a === "'" && b === "'")) {
      s = s.slice(1, -1).trim()
    }
  }
  return s
}

/** AI Chat API Key（须服务端变量，勿使用 NEXT_PUBLIC_ 前缀） */
export function getDeepseekApiKey(): string {
  return readServerEnv("DEEPSEEK_API_KEY")
}

export function getAdminAccessKey(): string {
  return readServerEnv("CREDIT_ADMIN_ACCESS_KEY")
}

/** 未配置密钥时返回给前端的说明（含本地与托管平台等线上场景） */
export function deepseekApiKeyMissingUserMessage(): string {
  return (
    "未配置可用的 AI 服务密钥。" +
    "本地：在项目根目录 .env.local 或 .env 写入 AI 服务密钥=sk-…，保存后重启 pnpm dev。" +
    "线上：Site configuration → Environment variables → 添加 AI 服务密钥（值不要加引号；勿使用 NEXT_PUBLIC_ 前缀），保存后 Clear cache and deploy 重新部署。"
  )
}
