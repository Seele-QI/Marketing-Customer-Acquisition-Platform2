#!/usr/bin/env node
/**
 * API connectivity smoke test for local dev:all (Next :3000 + FastAPI :8000).
 * Usage: node scripts/smoke-api-connectivity.mjs [--json-out path]
 */
import { writeFileSync } from "node:fs"
import { resolve } from "node:path"

const NEXT_BASE = process.env.SMOKE_NEXT_URL || "http://127.0.0.1:3000"
const API_BASE = process.env.SMOKE_FASTAPI_URL || "http://127.0.0.1:8000"

/** @typedef {{ name: string, method: string, url: string, expectStatus?: number[], expectNot?: number[], body?: unknown, headers?: Record<string,string>, cookie?: string, note?: string }} Probe */

/** @type {Probe[]} */
const NEXT_PROBES = [
  { name: "health_proxy", method: "GET", url: `${NEXT_BASE}/api/health`, expectStatus: [200, 503], note: "503 if ffmpeg missing; proxy chain OK if JSON returned" },
  { name: "auth_me_unauth", method: "GET", url: `${NEXT_BASE}/api/auth/me`, expectStatus: [401] },
  { name: "credit_balance_unauth", method: "GET", url: `${NEXT_BASE}/api/credit/balance`, expectStatus: [401] },
  { name: "video_status_unauth", method: "GET", url: `${NEXT_BASE}/api/video/status?taskId=smoke_test`, expectStatus: [401, 404] },
  { name: "iv_status_unauth", method: "GET", url: `${NEXT_BASE}/api/video/image-to-video/status?taskId=smoke_test`, expectStatus: [401, 404] },
  { name: "mv_status_unauth", method: "GET", url: `${NEXT_BASE}/api/video/mashup/status?taskId=smoke_test`, expectStatus: [401, 404] },
  { name: "video_generate_bad_body", method: "POST", url: `${NEXT_BASE}/api/video/generate`, expectStatus: [401, 400, 422], body: {}, headers: { "Content-Type": "application/json" } },
  { name: "iv_submit_bad_body", method: "POST", url: `${NEXT_BASE}/api/video/image-to-video`, expectStatus: [401, 400, 422], body: {}, headers: { "Content-Type": "application/json" } },
  { name: "mv_submit_bad_body", method: "POST", url: `${NEXT_BASE}/api/video/mashup`, expectStatus: [401, 400, 422], body: {}, headers: { "Content-Type": "application/json" } },
  { name: "trends_fetch_all", method: "GET", url: `${NEXT_BASE}/api/trends/fetch-all`, expectNot: [502, 503], note: "200 or 4xx if key missing" },
  { name: "credit_redeem_codes_unauth", method: "GET", url: `${NEXT_BASE}/api/credit/redeem-codes`, expectStatus: [401, 403] },
]

/** @type {Probe[]} */
const FASTAPI_PROBES = [
  { name: "fastapi_health", method: "GET", url: `${API_BASE}/health`, expectStatus: [200, 503], note: "503 degraded when ffmpeg not on PATH" },
  { name: "promo_storyboard_status", method: "GET", url: `${API_BASE}/api/promo-video/storyboard-status?taskId=smoke`, expectStatus: [404], note: "route registered; 404 = task not found" },
  { name: "douyin_qrcode_missing", method: "GET", url: `${API_BASE}/api/accounts/douyin/qrcode`, expectStatus: [404], note: "intentionally disabled backend" },
  { name: "accounts_list_unauth", method: "GET", url: `${API_BASE}/api/accounts/list`, expectStatus: [401] },
  { name: "clone_voice_snake_case", method: "POST", url: `${API_BASE}/api/video/clone-voice`, expectStatus: [401, 503], body: { audio_base64: "dGVzdA==", script: "test" }, headers: { "Content-Type": "application/json" }, note: "correct field names" },
  { name: "clone_voice_next_proxy", method: "POST", url: `${NEXT_BASE}/api/video/clone-voice`, expectStatus: [401, 422], body: { audio_base64: "dGVzdA==", script: "test" }, headers: { "Content-Type": "application/json" }, note: "Next proxy route" },
]

/** @type {Probe[]} */
const AUTHED_PROBES = []

/**
 * @param {Probe} probe
 * @returns {Promise<{ probe: Probe, status: number, ok: boolean, pass: boolean, bodyPreview: string, error?: string }>}
 */
async function runProbe(probe) {
  try {
    const init = {
      method: probe.method,
      headers: { ...(probe.headers || {}) },
    }
    if (probe.cookie) init.headers["Cookie"] = probe.cookie
    if (probe.body !== undefined) init.body = JSON.stringify(probe.body)

    const res = await fetch(probe.url, init)
    const text = await res.text()
    let bodyPreview = text.slice(0, 200)
    try {
      bodyPreview = JSON.stringify(JSON.parse(text)).slice(0, 200)
    } catch {
      /* keep text */
    }

    let pass = true
    if (probe.expectStatus) pass = probe.expectStatus.includes(res.status)
    if (probe.expectNot) pass = pass && !probe.expectNot.includes(res.status)

    return { probe, status: res.status, ok: res.ok, pass, bodyPreview }
  } catch (err) {
    return {
      probe,
      status: 0,
      ok: false,
      pass: false,
      bodyPreview: "",
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

async function registerAndLogin() {
  const email = `smoke_${Date.now()}@example.com`
  const password = "SmokeTest123!"
  const reg = await fetch(`${NEXT_BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_name: email, password, confirm_password: password }),
  })
  if (!reg.ok) {
    const detail = await reg.text()
    return { ok: false, error: `register ${reg.status}: ${detail.slice(0, 120)}` }
  }
  const login = await fetch(`${NEXT_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login_name: email, password }),
  })
  if (!login.ok) {
    return { ok: false, error: `login ${login.status}` }
  }
  const setCookie = login.headers.get("set-cookie") || ""
  const match = setCookie.match(/session_id=([^;]+)/)
  if (!match) return { ok: false, error: "no session_id cookie" }
  return { ok: true, cookie: `session_id=${match[1]}`, email }
}

async function main() {
  const started = Date.now()
  const results = []

  console.log(`Smoke API connectivity`)
  console.log(`  Next:    ${NEXT_BASE}`)
  console.log(`  FastAPI: ${API_BASE}`)
  console.log("")

  for (const probe of [...NEXT_PROBES, ...FASTAPI_PROBES]) {
    const r = await runProbe(probe)
    results.push(r)
    const mark = r.pass ? "PASS" : "FAIL"
    console.log(`[${mark}] ${r.probe.name} → ${r.status || "ERR"} ${r.error || ""}`)
  }

  console.log("\n--- Authed module spot checks ---")
  const auth = await registerAndLogin()
  if (!auth.ok) {
    console.log(`[SKIP] authed probes: ${auth.error}`)
  } else {
    console.log(`[INFO] logged in as ${auth.email}`)
    const authed = [
      { name: "auth_me", method: "GET", url: `${NEXT_BASE}/api/auth/me`, expectStatus: [200], cookie: auth.cookie },
      { name: "credit_balance", method: "GET", url: `${NEXT_BASE}/api/credit/balance`, expectStatus: [200], cookie: auth.cookie },
      { name: "credit_ledger_user", method: "GET", url: `${NEXT_BASE}/api/credit/ledger?limit=5`, expectStatus: [200], cookie: auth.cookie },
      { name: "promo_submit_authed_bad", method: "POST", url: `${API_BASE}/api/promo-video/submit`, expectStatus: [400, 401], cookie: auth.cookie, body: {}, headers: { "Content-Type": "application/json" }, note: "promo route registered" },
      { name: "video_status_authed", method: "GET", url: `${NEXT_BASE}/api/video/status?taskId=smoke_missing`, expectStatus: [404], cookie: auth.cookie },
      { name: "iv_status_authed", method: "GET", url: `${NEXT_BASE}/api/video/image-to-video/status?taskId=smoke_missing`, expectStatus: [404], cookie: auth.cookie },
      { name: "mv_status_authed", method: "GET", url: `${NEXT_BASE}/api/video/mashup/status?taskId=smoke_missing`, expectStatus: [404], cookie: auth.cookie },
      { name: "iv_submit_authed_bad", method: "POST", url: `${NEXT_BASE}/api/video/image-to-video`, expectStatus: [400, 422], cookie: auth.cookie, body: {}, headers: { "Content-Type": "application/json" } },
    ]
    for (const probe of authed) {
      const r = await runProbe(probe)
      results.push(r)
      const mark = r.pass ? "PASS" : "FAIL"
      console.log(`[${mark}] ${r.probe.name} → ${r.status || "ERR"} ${r.error || ""}`)
    }
  }

  const passed = results.filter((r) => r.pass).length
  const failed = results.filter((r) => !r.pass).length
  const summary = { passed, failed, total: results.length, durationMs: Date.now() - started, results }

  console.log(`\nSummary: ${passed}/${results.length} passed, ${failed} failed (${summary.durationMs}ms)`)

  const jsonOut = process.argv.includes("--json-out")
    ? process.argv[process.argv.indexOf("--json-out") + 1]
    : resolve("docs/audit/smoke-results.json")

  try {
    writeFileSync(jsonOut, JSON.stringify(summary, null, 2))
    console.log(`Wrote ${jsonOut}`)
  } catch (err) {
    console.warn(`Could not write JSON: ${err}`)
  }

  process.exit(failed > 0 ? 1 : 0)
}

main()
