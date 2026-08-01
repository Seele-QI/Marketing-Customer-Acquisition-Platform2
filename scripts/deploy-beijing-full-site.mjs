/**
 * Deploy FULL zhongtai-main (Dockerfile.api + Dockerfile.web) to NEW Beijing services only.
 *
 * Creates/uses:
 *   - zhongtai-full-api  (video + ffmpeg + local credit DB)
 *   - zhongtai-full-web  (full Next UI)
 *
 * NEVER touches:
 *   - zhongtai-cloud-api / zhongtai-cloud-web
 *   - mcap-cloud-*.preview.aliyun-zeabur.cn (desktop CLOUD_API_URL)
 *
 * Usage:
 *   node scripts/deploy-beijing-full-site.mjs
 */
import crypto from "node:crypto"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const token = fs
  .readFileSync(path.join(os.homedir(), ".config/zeabur/cli.yaml"), "utf8")
  .match(/^token:\s*(.+)$/m)[1]
  .trim()

const PROJECT_ID = "6a55b4960d3aedb1dbcf811f"
const ENV_ID = "6a55b49671e4f22eed327822"

const FORBIDDEN = new Set([
  "6a55b4970d3aedb1dbcf8121", // cloud-web
  "6a55b4970d3aedb1dbcf8122", // cloud-api
  "6a56032278e1cb936fb7356c", // central-manifest
  "6a4e94c0c2881a93656e89d0", // HK api
  "6a4e98aef04125ac9a33c13c", // HK web
])

const FULL_API_NAME = "zhongtai-full-api"
const FULL_WEB_NAME = "zhongtai-full-web"

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
}

async function gql(query, variables = {}) {
  const res = await fetch("https://api.zeabur.com/graphql", {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables }),
  })
  const j = await res.json()
  if (j.errors?.length) {
    console.error("GQL errors:", JSON.stringify(j.errors, null, 2))
  }
  return j
}

function assertAllowed(serviceId, label) {
  if (FORBIDDEN.has(serviceId)) {
    throw new Error(`REFUSED: ${label} id ${serviceId} is a protected cloud/HK service`)
  }
}

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith("#")) continue
    const i = t.indexOf("=")
    if (i < 0) continue
    const k = t.slice(0, i).trim()
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

async function ensureService(name) {
  const p = await gql(
    `query($id:ObjectID!){ project(_id:$id){ services { _id name } } }`,
    { id: PROJECT_ID },
  )
  const hit = p.data.project.services.find((s) => s.name === name)
  if (hit) {
    assertAllowed(hit._id, name)
    return hit
  }
  const c = await gql(
    `mutation($name:String!,$projectID:ObjectID!){
      createService(name:$name, template:GIT, projectID:$projectID){ _id name }
    }`,
    { name, projectID: PROJECT_ID },
  )
  if (!c.data?.createService) throw new Error(`createService ${name} failed`)
  assertAllowed(c.data.createService._id, name)
  console.log("[create]", c.data.createService)
  return c.data.createService
}

async function setPorts(serviceId, port) {
  assertAllowed(serviceId, "setPorts")
  const j = await gql(
    `mutation($s:ObjectID!,$e:ObjectID!,$ports:[ServiceSpecPortInput!]!){
      updateServicePorts(serviceID:$s, environmentID:$e, ports:$ports)
    }`,
    {
      s: serviceId,
      e: ENV_ID,
      ports: [{ id: "web", port, type: "HTTP" }],
    },
  )
  if (j.errors) throw new Error("updateServicePorts failed")
  console.log("[ports]", serviceId, port)
}

async function ensureGeneratedDomain(serviceId, preferredPrefix) {
  assertAllowed(serviceId, "domain")
  const cur = await gql(
    `query($id:ObjectID!){ service(_id:$id){ domains { domain } dnsName } }`,
    { id: serviceId },
  )
  const domains = cur.data?.service?.domains || []
  const good = domains.find((d) => d.domain && !d.domain.startsWith("preview.preview."))
  if (good) {
    console.log("[domain] existing", good.domain)
    return good.domain
  }
  for (const bad of domains) {
    if (!bad.domain) continue
    const rm = await gql(`mutation($d:String!){ removeDomain(domain:$d) }`, { d: bad.domain })
    console.log("[domain] removed", bad.domain, JSON.stringify(rm.data || rm.errors))
  }
  const prefix = preferredPrefix || `mcap-full-${serviceId.slice(-4)}`
  const j = await gql(
    `mutation($s:ObjectID!,$e:ObjectID!,$d:String!){
      addDomain(serviceID:$s, environmentID:$e, domain:$d, isGenerated:true) { domain }
    }`,
    { s: serviceId, e: ENV_ID, d: prefix },
  )
  if (j.errors || !j.data?.addDomain?.domain) {
    throw new Error("addDomain failed: " + JSON.stringify(j.errors || j.data))
  }
  console.log("[domain]", j.data.addDomain.domain)
  return j.data.addDomain.domain
}

async function ensureVolume(serviceId, volumeId, dir) {
  assertAllowed(serviceId, "volume")
  const j = await gql(
    `query($id:ObjectID!,$e:ObjectID!){
      service(_id:$id){ volumes(environmentID:$e){ id dir } }
    }`,
    { id: serviceId, e: ENV_ID },
  )
  const vols = j.data?.service?.volumes || []
  if (vols.some((v) => v.dir === dir || v.id === volumeId)) {
    console.log("[volume] already", vols)
    return
  }
  const m = await gql(
    `mutation($s:ObjectID!,$id:String!,$dir:String!){
      mountVolume(serviceID:$s, id:$id, dir:$dir)
    }`,
    { s: serviceId, id: volumeId, dir },
  )
  if (m.errors) throw new Error("mountVolume failed")
  console.log("[volume] mounted", volumeId, dir)
}

async function setDockerfile(serviceId, content) {
  assertAllowed(serviceId, "dockerfile")
  const j = await gql(
    `mutation($s:ObjectID!,$d:String!){ updateDockerfile(serviceID:$s, dockerfile:$d) }`,
    { s: serviceId, d: content },
  )
  if (j.errors || !j.data?.updateDockerfile) throw new Error("updateDockerfile failed")
  console.log("[dockerfile] updated", serviceId, "bytes", content.length)
}

async function upsertEnv(serviceId, data) {
  assertAllowed(serviceId, "env")
  // IMPORTANT: updateEnvironmentVariable(Map) REPLACES the whole env set on Zeabur.
  // Always upsert key-by-key.
  let ok = 0
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue
    const v = String(value)
    const c = await gql(
      `mutation($s:ObjectID!,$e:ObjectID!,$key:String!,$value:String!){
        createEnvironmentVariable(serviceID:$s, environmentID:$e, key:$key, value:$value){ key }
      }`,
      { s: serviceId, e: ENV_ID, key, value: v },
    )
    if (c.errors) {
      const u = await gql(
        `mutation($s:ObjectID!,$e:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){
          updateSingleEnvironmentVariable(serviceID:$s, environmentID:$e, oldKey:$oldKey, newKey:$newKey, value:$value){ key }
        }`,
        { s: serviceId, e: ENV_ID, oldKey: key, newKey: key, value: v },
      )
      if (u.errors) console.warn("[env] fail", key, JSON.stringify(u.errors).slice(0, 200))
      else ok++
    } else ok++
  }
  console.log("[env] upserted keys", ok)
}

function makeServiceZip(dockerfilePath) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "zhongtai-full-"))
  const tarPath = path.join(os.tmpdir(), `zhongtai-src-${Date.now()}.tar`)
  const zipPath = path.join(os.tmpdir(), `zhongtai-${path.basename(dockerfilePath)}-${Date.now()}.zip`)

  const archive = spawnSync("git", ["archive", "--format=tar", "-o", tarPath, "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  })
  if (archive.status !== 0) {
    throw new Error(archive.stderr || archive.stdout || "git archive failed")
  }
  spawnSync("tar", ["-xf", tarPath, "-C", work], { encoding: "utf8" })

  fs.copyFileSync(path.join(ROOT, dockerfilePath), path.join(work, "Dockerfile"))
  fs.copyFileSync(path.join(ROOT, dockerfilePath), path.join(work, dockerfilePath))

  const required =
    dockerfilePath === "Dockerfile.api"
      ? ["scripts", "lib", "routes", "assets", "main.py", "requirements.txt"]
      : ["scripts", "package.json", "pnpm-lock.yaml", "app", "components", "lib"]
  for (const name of required) {
    if (!fs.existsSync(path.join(work, name))) {
      throw new Error(`zip staging missing: ${name}`)
    }
  }

  if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)
  const zip = spawnSync("tar", ["-a", "-cf", zipPath, "-C", work, "."], { encoding: "utf8" })
  if (zip.status !== 0) throw new Error(zip.stderr || "tar zip failed")
  try {
    fs.unlinkSync(tarPath)
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(work, { recursive: true, force: true })
  } catch {
    /* ignore */
  }
  console.log("[zip]", dockerfilePath, fs.statSync(zipPath).size, "bytes")
  return zipPath
}

async function uploadAndDeploy(zipPath, serviceId) {
  assertAllowed(serviceId, "upload")
  const buf = fs.readFileSync(zipPath)
  const content_hash = crypto.createHash("sha256").update(buf).digest("base64")
  const create = await fetch("https://api.zeabur.com/v2/upload", {
    method: "POST",
    headers,
    body: JSON.stringify({
      content_hash,
      content_hash_algorithm: "sha256",
      content_length: buf.length,
    }),
  })
  const meta = await create.json()
  if (!create.ok) throw new Error("upload create failed: " + JSON.stringify(meta))
  const put = await fetch(meta.presign_url, {
    method: meta.presign_method || "PUT",
    headers: { ...(meta.presign_header || {}) },
    body: buf,
  })
  if (!put.ok) throw new Error("upload put failed")
  const prep = await fetch(`https://api.zeabur.com/v2/upload/${meta.upload_id}/prepare`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      upload_type: "existing_service",
      service_id: serviceId,
      environment_id: ENV_ID,
    }),
  })
  const prepText = await prep.text()
  console.log("[deploy]", serviceId, prep.status, prepText.slice(0, 300))
  if (!prep.ok) throw new Error("prepare failed")
  return prepText
}

async function waitHttp(url, pred, timeoutMs = 15 * 60 * 1000) {
  const start = Date.now()
  let i = 0
  while (Date.now() - start < timeoutMs) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) })
      const t = await r.text()
      console.log(`[wait ${i}]`, url, r.status, t.slice(0, 140).replace(/\s+/g, " "))
      if (pred(r.status, t)) return true
    } catch (e) {
      console.log(`[wait ${i}]`, url, e.message || e)
    }
    i++
    await new Promise((r) => setTimeout(r, 15000))
  }
  return false
}

async function main() {
  const localEnv = {
    ...parseDotEnv(path.join(ROOT, ".env")),
    ...parseDotEnv(path.join(ROOT, ".env.local")),
  }

  const api = await ensureService(FULL_API_NAME)
  const web = await ensureService(FULL_WEB_NAME)
  assertAllowed(api._id, FULL_API_NAME)
  assertAllowed(web._id, FULL_WEB_NAME)

  // Ports: Zeabur Beijing HTTP convention uses 8080 (override Dockerfile defaults via PORT env)
  await setPorts(api._id, 8080)
  await setPorts(web._id, 8080)

  // Dedicated volume — NOT the cloud api volume id "data" on cloud service
  await ensureVolume(api._id, "full-data", "/data")

  await setDockerfile(api._id, fs.readFileSync(path.join(ROOT, "Dockerfile.api"), "utf8"))
  await setDockerfile(web._id, fs.readFileSync(path.join(ROOT, "Dockerfile.web"), "utf8"))

  const apiDomain = await ensureGeneratedDomain(api._id, "mcap-full-api")
  const webDomain = await ensureGeneratedDomain(web._id, "mcap-full-web")
  const apiPublic = apiDomain ? `https://${apiDomain}` : ""
  const webPublic = webDomain ? `https://${webDomain}` : ""

  // Fresh salt for THIS site's own accounts DB (do not share cloud DB)
  const emailSalt =
    localEnv.EMAIL_HASH_SALT_FULL ||
    localEnv.EMAIL_HASH_SALT ||
    crypto.randomBytes(32).toString("hex")

  const pick = (...keys) => {
    for (const k of keys) {
      if (localEnv[k]) return localEnv[k]
    }
    return ""
  }

  const apiEnv = {
    ZBPACK_DOCKERFILE_PATH: "Dockerfile",
    PYTHONUNBUFFERED: "1",
    PORT: "8080",
    HOST: "0.0.0.0",
    DATA_DIR: "/data",
    CREDIT_DB_OVERRIDE: "/data/accounts.db",
    VIDEO_BGM_DIR: "/app/assets/bgm",
    VIDEO_POSTPROCESS_DIR: "/data/video-postprocess",
    EMAIL_HASH_SALT: emailSalt,
    CREDIT_ADMIN_ACCESS_KEY: pick("CREDIT_ADMIN_ACCESS_KEY"),
    CREDIT_REGISTER_BONUS: pick("CREDIT_REGISTER_BONUS") || "100",
    CREDIT_SESSION_TTL_DAYS: pick("CREDIT_SESSION_TTL_DAYS") || "30",
    CREDIT_EMAIL_TOKEN_TTL_SECONDS: pick("CREDIT_EMAIL_TOKEN_TTL_SECONDS") || "900",
    CREDIT_METERED_KEY: pick("CREDIT_METERED_KEY"),
    DEEPSEEK_API_KEY: pick("DEEPSEEK_API_KEY"),
    DEEPSEEK_CHAT_MODEL: pick("DEEPSEEK_CHAT_MODEL") || "deepseek-v4-pro",
    RUNNINGHUB_API_KEY: pick("RUNNINGHUB_API_KEY"),
    SEEDANCE_PRIMARY_BASE_URL: pick("SEEDANCE_PRIMARY_BASE_URL") || "https://api.7tai.cc",
    SEEDANCE_PRIMARY_API_KEY: pick("SEEDANCE_PRIMARY_API_KEY"),
    SEEDANCE_PRIMARY_MODEL: pick("SEEDANCE_PRIMARY_MODEL") || "sd2-福利",
    SEEDANCE_PRIMARY_MEDIA_MODE: pick("SEEDANCE_PRIMARY_MEDIA_MODE") || "url",
    SEEDANCE_API_KEY: pick("SEEDANCE_API_KEY"),
    SEEDANCE_BASE_URL: pick("SEEDANCE_BASE_URL") || "https://www.aicost.xyz",
    NEWAPI_BASE_URL: pick("NEWAPI_BASE_URL") || "https://www.aicost.xyz",
    NEWAPI_KEY: pick("NEWAPI_KEY"),
    NEWAPI_GPT_MODEL: pick("NEWAPI_GPT_MODEL") || "gpt-5.5",
    NEWAPI_CLAUDE_MODEL: pick("NEWAPI_CLAUDE_MODEL") || "claude-opus-4-8",
    ARK_API_KEY: pick("ARK_API_KEY"),
    ARK_BASE_URL: pick("ARK_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3",
    ARK_CHAT_MODEL: pick("ARK_CHAT_MODEL") || "doubao-seed-2-1-pro-260628",
    ARK_ENDPOINT_ID: pick("ARK_ENDPOINT_ID"),
    ARK_IMAGE_ENDPOINT_ID: pick("ARK_IMAGE_ENDPOINT_ID"),
    ARK_IMAGE_API_KEY: pick("ARK_IMAGE_API_KEY"),
    TIANAPI_KEY: pick("TIANAPI_KEY"),
    ALIYUN_ACCESS_KEY_ID: pick("ALIYUN_ACCESS_KEY_ID"),
    ALIYUN_ACCESS_KEY_SECRET: pick("ALIYUN_ACCESS_KEY_SECRET"),
    ALIYUN_ASR_APP_KEY: pick("ALIYUN_ASR_APP_KEY"),
    RESEND_API_KEY: pick("RESEND_API_KEY"),
    RESEND_FROM: pick("RESEND_FROM") || "中台 <noreply@example.com>",
    APP_PUBLIC_BASE: webPublic || pick("APP_PUBLIC_BASE"),
    DEV_EMAIL_MODE: pick("DEV_EMAIL_MODE") || "0",
    CORS_ALLOW_ORIGINS: webPublic,
    CENTRAL_LATEST_VERSION: pick("CENTRAL_LATEST_VERSION") || "0.1.3",
    CENTRAL_FORCE_UPDATE_BELOW: pick("CENTRAL_FORCE_UPDATE_BELOW") || "0.0.1",
    CENTRAL_UPDATE_URL:
      pick("CENTRAL_UPDATE_URL") ||
      "https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/",
    FFMPEG_MAX_CONCURRENT: "2",
  }

  // Internal DNS uses service dnsName; port = container listen port
  const apiInternal = `http://${FULL_API_NAME}.zeabur.internal:8080`

  const webEnv = {
    ZBPACK_DOCKERFILE_PATH: "Dockerfile",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: "8080",
    HOSTNAME: "0.0.0.0",
    FASTAPI_URL: apiInternal,
    NEXT_PUBLIC_FASTAPI_URL: apiPublic,
    NEXT_PUBLIC_DH_VIDEO_V2_MOCK: "0",
    // Keep empty so this full site uses its own api auth/credit, NOT desktop cloud control plane
    CLOUD_API_URL: "",
    NEXT_PUBLIC_CLOUD_API_URL: "",
    APP_PUBLIC_BASE: webPublic,
    DEEPSEEK_API_KEY: pick("DEEPSEEK_API_KEY"),
    DEEPSEEK_CHAT_MODEL: pick("DEEPSEEK_CHAT_MODEL") || "deepseek-v4-pro",
    ARK_API_KEY: pick("ARK_API_KEY"),
    ARK_BASE_URL: pick("ARK_BASE_URL") || "https://ark.cn-beijing.volces.com/api/v3",
    ARK_CHAT_MODEL: pick("ARK_CHAT_MODEL") || "doubao-seed-2-1-pro-260628",
    ARK_ENDPOINT_ID: pick("ARK_ENDPOINT_ID"),
    ARK_IMAGE_ENDPOINT_ID: pick("ARK_IMAGE_ENDPOINT_ID"),
    ARK_IMAGE_API_KEY: pick("ARK_IMAGE_API_KEY"),
    NEWAPI_BASE_URL: pick("NEWAPI_BASE_URL") || "https://www.aicost.xyz",
    NEWAPI_KEY: pick("NEWAPI_KEY"),
    CREDIT_METERED_KEY: pick("CREDIT_METERED_KEY"),
    RESEND_API_KEY: pick("RESEND_API_KEY"),
    RESEND_FROM: pick("RESEND_FROM") || "中台 <noreply@example.com>",
    DEV_EMAIL_MODE: pick("DEV_EMAIL_MODE") || "0",
    EMAIL_HASH_SALT: emailSalt,
    CREDIT_ADMIN_ACCESS_KEY: pick("CREDIT_ADMIN_ACCESS_KEY"),
    ADMIN_LOGIN_NAME: pick("ADMIN_LOGIN_NAME"),
    ADMIN_PASSWORD_HASH: pick("ADMIN_PASSWORD_HASH"),
    ADMIN_PASSWORD_SALT: pick("ADMIN_PASSWORD_SALT"),
    TIANAPI_KEY: pick("TIANAPI_KEY"),
  }

  await upsertEnv(api._id, apiEnv)
  await upsertEnv(web._id, webEnv)

  const apiZip = makeServiceZip("Dockerfile.api")
  const webZip = makeServiceZip("Dockerfile.web")
  await uploadAndDeploy(apiZip, api._id)
  await uploadAndDeploy(webZip, web._id)

  // Re-fetch domains (generated after first deploy sometimes)
  const apiInfo = await gql(
    `query($id:ObjectID!){ service(_id:$id){ domains { domain } dnsName } }`,
    { id: api._id },
  )
  const webInfo = await gql(
    `query($id:ObjectID!){ service(_id:$id){ domains { domain } dnsName } }`,
    { id: web._id },
  )
  let apiHost = apiInfo.data?.service?.domains?.[0]?.domain || apiDomain
  let webHost = webInfo.data?.service?.domains?.[0]?.domain || webDomain

  if (!apiHost) {
    apiHost = await ensureGeneratedDomain(api._id, "mcap-full-api")
  }
  if (!webHost) {
    webHost = await ensureGeneratedDomain(web._id, "mcap-full-web")
  }

  if (apiHost && webHost) {
    // Refresh public URLs now that domains exist
    await upsertEnv(api._id, {
      CORS_ALLOW_ORIGINS: `https://${webHost}`,
      APP_PUBLIC_BASE: `https://${webHost}`,
    })
    await upsertEnv(web._id, {
      FASTAPI_URL: apiInternal,
      NEXT_PUBLIC_FASTAPI_URL: `https://${apiHost}`,
      APP_PUBLIC_BASE: `https://${webHost}`,
    })
  }

  const apiOk = apiHost
    ? await waitHttp(`https://${apiHost}/health`, (s, t) => s === 200 && t.includes('"status"'))
    : false
  const webOk = webHost
    ? await waitHttp(`https://${webHost}/`, (s) => s === 200 || s === 307 || s === 308)
    : false

  // Safety: cloud still intact
  const cloudApi = await fetch("https://mcap-cloud-api.preview.aliyun-zeabur.cn/health")
  const cloudBody = await cloudApi.text()
  const cloudSync = await fetch("https://mcap-cloud-api.preview.aliyun-zeabur.cn/api/config/sync")
  console.log("[safety] cloud health", cloudApi.status, cloudBody.slice(0, 100))
  console.log("[safety] cloud config/sync", cloudSync.status, "(expect 405)")

  const summary = {
    at: new Date().toISOString(),
    fullApi: { id: api._id, name: FULL_API_NAME, domain: apiHost, healthy: apiOk },
    fullWeb: { id: web._id, name: FULL_WEB_NAME, domain: webHost, healthy: webOk },
    cloudUntouched: {
      health: cloudApi.status,
      configSync: cloudSync.status,
      bodyHint: cloudBody.includes("zhongtai-cloud-api"),
    },
  }
  fs.writeFileSync(path.join(ROOT, ".tmp-full-site-deploy.json"), JSON.stringify(summary, null, 2))
  console.log("\n=== SUMMARY ===")
  console.log(JSON.stringify(summary, null, 2))
  if (!apiOk || !webOk) process.exitCode = 2
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
