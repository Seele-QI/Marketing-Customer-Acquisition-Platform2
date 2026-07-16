#!/usr/bin/env node
/**
 * 桌面端 ↔ 云端连通性验收（不依赖 Electron）。
 *
 * 用法：
 *   node scripts/verify-cloud-connectivity.mjs --cloud https://mcap-cloud-api.preview.aliyun-zeabur.cn
 *   node scripts/verify-cloud-connectivity.mjs --cloud https://mcap-cloud-api.preview.aliyun-zeabur.cn --local http://127.0.0.1:3000
 */
const args = process.argv.slice(2)
let cloud = process.env.CLOUD_API_URL || "https://mcap-cloud-api.preview.aliyun-zeabur.cn"
let local = ""
let loginName = process.env.TEST_LOGIN_NAME || "cloudtest01"
let password = process.env.TEST_PASSWORD || "password123"

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--cloud" && args[i + 1]) cloud = args[++i]
  else if (args[i] === "--local" && args[i + 1]) local = args[++i]
  else if (args[i] === "--user" && args[i + 1]) loginName = args[++i]
  else if (args[i] === "--password" && args[i + 1]) password = args[++i]
}

cloud = cloud.replace(/\/$/, "")
local = local.replace(/\/$/, "")

function parseSetCookie(header) {
  if (!header) return ""
  const first = header.split(",")[0]
  return first.split(";")[0].trim()
}

async function main() {
  const health = await fetch(`${cloud}/health`)
  if (!health.ok) throw new Error(`health ${health.status}`)
  const healthBody = await health.json()
  if (healthBody.status !== "ok") throw new Error(`health body: ${JSON.stringify(healthBody)}`)
  console.log("OK cloud /health")

  let cookie = ""
  const reg = await fetch(`${cloud}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      login_name: loginName,
      password,
      confirm_password: password,
    }),
  })
  if (reg.status === 400 && (await reg.text()).includes("已存在")) {
    const login = await fetch(`${cloud}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login_name: loginName, password }),
    })
    if (!login.ok) throw new Error(`login ${login.status}`)
    cookie = parseSetCookie(login.headers.get("set-cookie"))
  } else if (reg.ok) {
    cookie = parseSetCookie(reg.headers.get("set-cookie"))
  } else {
    throw new Error(`register ${reg.status}`)
  }
  if (!cookie) throw new Error("missing session cookie")
  console.log("OK cloud auth")

  const sync = await fetch(`${cloud}/api/config/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ client_version: "0.1.0", known_version: "" }),
  })
  if (!sync.ok) throw new Error(`config/sync ${sync.status}: ${await sync.text()}`)
  const syncBody = await sync.json()
  const keys = syncBody.keys || {}
  const required = [
    "DEEPSEEK_API_KEY",
    "SEEDANCE_PRIMARY_BASE_URL",
    "SEEDANCE_PRIMARY_API_KEY",
    "NEWAPI_KEY",
    "NEWAPI_BASE_URL",
  ]
  const missing = required.filter((k) => !keys[k])
  // 分镜至少要 NEWAPI_KEY 或 DEEPSEEK_API_KEY 之一
  const planLlmOk = Boolean(keys.NEWAPI_KEY || keys.DEEPSEEK_API_KEY || keys.SONETTO_GPT_API_KEY)
  if (!planLlmOk) {
    throw new Error(
      "config/sync missing plan-script LLM keys: need NEWAPI_KEY or DEEPSEEK_API_KEY (else Electron 分镜 503)",
    )
  }
  if (missing.length) {
    console.warn("WARN config/sync missing keys:", missing.join(", "))
  } else {
    console.log("OK config/sync keys:", Object.keys(keys).length)
  }

  if (local) {
    const me = await fetch(`${local}/api/auth/me`, { headers: { Cookie: cookie } })
    if (!me.ok) throw new Error(`local /api/auth/me ${me.status}`)
    const meBody = await me.json()
    if (!meBody.user?.id) throw new Error("local proxy me missing user")
    console.log("OK local Next proxy /api/auth/me")
  } else {
    console.log("SKIP local Next proxy (pass --local http://127.0.0.1:3000 to test)")
  }

  console.log("[ok] cloud connectivity", { cloud, local: local || null, key_count: Object.keys(keys).length })
}

main().catch((e) => {
  console.error("[fail]", e.message || e)
  process.exit(1)
})
