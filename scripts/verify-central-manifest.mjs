#!/usr/bin/env node
/**
 * 本地冒烟：Next 或 sidecar manifest 契约
 *   node scripts/verify-central-manifest.mjs
 *   node scripts/verify-central-manifest.mjs --url https://xxx/api/central/manifest
 */
const args = process.argv.slice(2)
let url =
  process.env.CLOUD_MANIFEST_URL ||
  process.env.CLOUD_API_URL ||
  "https://mcap-cloud-api.preview.aliyun-zeabur.cn"
url = url.replace(/\/+$/, "")
if (!url.includes("/api/central/manifest")) {
  url = `${url}/api/central/manifest`
}

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--url" && args[i + 1]) url = args[++i]
}

const targets = [
  url,
  url.replace(/mcap-cloud-api/gi, "mcap-cloud-web"),
  "https://mcap-cloud-api.zeabur.app/api/central/manifest",
  "https://mcap-cloud-web.zeabur.app/api/central/manifest",
]

async function probe(u) {
  const full = `${u}${u.includes("?") ? "&" : "?"}client_version=0.0.1`.replace(
    /\?\&/,
    "?",
  )
  // normalize: ensure query after path
  const base = u.split("?")[0]
  const probeUrl = `${base}?client_version=0.0.1`
  try {
    const r = await fetch(probeUrl, { signal: AbortSignal.timeout(15000) })
    const text = await r.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      /* ignore */
    }
    return { ok: r.ok, status: r.status, json, text: text.slice(0, 200), url: probeUrl }
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e), url: probeUrl }
  }
}

const seen = new Set()
let anyOk = false
for (const t of targets) {
  const key = t.split("?")[0]
  if (seen.has(key)) continue
  seen.add(key)
  const res = await probe(key)
  const mark = res.ok ? "OK" : "FAIL"
  console.log(`[${mark}] ${res.status} ${res.url}`)
  if (res.json) console.log("      ", JSON.stringify(res.json))
  else if (res.error) console.log("      ", res.error)
  else if (res.text) console.log("      ", res.text)
  if (res.ok && res.json && typeof res.json.force_update === "boolean") anyOk = true
}

if (!anyOk) {
  console.error(
    "\n[fail] 无可用 manifest。请部署 Dockerfile.central-manifest 旁路服务，或用 Dockerfile.api 重部署 api，或先跑 Next 含 app/api/central/manifest。",
  )
  process.exit(1)
}
console.log("\n[ok] at least one manifest endpoint is healthy")
