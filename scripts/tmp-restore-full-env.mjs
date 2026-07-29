import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const token = process.env.ZB_TOKEN
const ENV_ID = '6a55b49671e4f22eed327822'
const api = '6a59dda7f947b6cb3450f7dc'
const web = '6a59ddbef947b6cb3450f7e3'
const FORBIDDEN = new Set(['6a55b4970d3aedb1dbcf8121','6a55b4970d3aedb1dbcf8122'])

async function gql(query, variables={}) {
  const r = await fetch('https://api.zeabur.com/graphql', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  return r.json()
}

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const i = t.indexOf('=')
    if (i < 0) continue
    let v = t.slice(i + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[t.slice(0, i).trim()] = v
  }
  return out
}

async function upsertKey(serviceId, key, value) {
  if (FORBIDDEN.has(serviceId)) throw new Error('forbidden')
  const c = await gql(`mutation($s:ObjectID!,$e:ObjectID!,$key:String!,$value:String!){
    createEnvironmentVariable(serviceID:$s, environmentID:$e, key:$key, value:$value){ key }
  }`, { s: serviceId, e: ENV_ID, key, value: String(value ?? '') })
  if (c.errors) {
    await gql(`mutation($s:ObjectID!,$e:ObjectID!,$oldKey:String!,$newKey:String!,$value:String!){
      updateSingleEnvironmentVariable(serviceID:$s, environmentID:$e, oldKey:$oldKey, newKey:$newKey, value:$value){ key }
    }`, { s: serviceId, e: ENV_ID, oldKey: key, newKey: key, value: String(value ?? '') })
  }
}

async function upsertMany(serviceId, data) {
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue
    await upsertKey(serviceId, k, v)
  }
  console.log('upserted', Object.keys(data).length, 'to', serviceId)
}

const localEnv = { ...parseDotEnv(path.join(ROOT, '.env')), ...parseDotEnv(path.join(ROOT, '.env.local')) }
const pick = (...keys) => { for (const k of keys) if (localEnv[k]) return localEnv[k]; return '' }
const emailSalt = localEnv.EMAIL_HASH_SALT || crypto.randomBytes(32).toString('hex')
const apiPublic = 'https://mcap-full-api.preview.aliyun-zeabur.cn'
const webPublic = 'https://mcap-full-web.preview.aliyun-zeabur.cn'

const apiEnv = {
  ZBPACK_DOCKERFILE_PATH: 'Dockerfile',
  PYTHONUNBUFFERED: '1',
  PORT: '8080',
  HOST: '0.0.0.0',
  DATA_DIR: '/data',
  CREDIT_DB_OVERRIDE: '/data/accounts.db',
  VIDEO_BGM_DIR: '/app/assets/bgm',
  VIDEO_POSTPROCESS_DIR: '/data/video-postprocess',
  EMAIL_HASH_SALT: emailSalt,
  CREDIT_ADMIN_ACCESS_KEY: pick('CREDIT_ADMIN_ACCESS_KEY'),
  CREDIT_REGISTER_BONUS: pick('CREDIT_REGISTER_BONUS') || '100',
  CREDIT_SESSION_TTL_DAYS: pick('CREDIT_SESSION_TTL_DAYS') || '30',
  CREDIT_EMAIL_TOKEN_TTL_SECONDS: pick('CREDIT_EMAIL_TOKEN_TTL_SECONDS') || '900',
  CREDIT_METERED_KEY: pick('CREDIT_METERED_KEY'),
  DEEPSEEK_API_KEY: pick('DEEPSEEK_API_KEY'),
  DEEPSEEK_CHAT_MODEL: pick('DEEPSEEK_CHAT_MODEL') || 'deepseek-v4-pro',
  RUNNINGHUB_API_KEY: pick('RUNNINGHUB_API_KEY'),
  SEEDANCE_PRIMARY_BASE_URL: pick('SEEDANCE_PRIMARY_BASE_URL') || 'https://api.7tai.cc',
  SEEDANCE_PRIMARY_API_KEY: pick('SEEDANCE_PRIMARY_API_KEY'),
  SEEDANCE_PRIMARY_MODEL: pick('SEEDANCE_PRIMARY_MODEL') || 'sd2-福利',
  SEEDANCE_PRIMARY_MEDIA_MODE: pick('SEEDANCE_PRIMARY_MEDIA_MODE') || 'url',
  SEEDANCE_API_KEY: pick('SEEDANCE_API_KEY'),
  SEEDANCE_BASE_URL: pick('SEEDANCE_BASE_URL') || 'https://www.aicost.xyz',
  NEWAPI_BASE_URL: pick('NEWAPI_BASE_URL') || 'https://www.aicost.xyz',
  NEWAPI_KEY: pick('NEWAPI_KEY'),
  NEWAPI_GPT_MODEL: pick('NEWAPI_GPT_MODEL') || 'gpt-5.5',
  NEWAPI_CLAUDE_MODEL: pick('NEWAPI_CLAUDE_MODEL') || 'claude-opus-4-8',
  ARK_API_KEY: pick('ARK_API_KEY'),
  ARK_BASE_URL: pick('ARK_BASE_URL') || 'https://ark.cn-beijing.volces.com/api/v3',
  ARK_CHAT_MODEL: pick('ARK_CHAT_MODEL') || 'doubao-seed-2-1-pro-260628',
  ARK_ENDPOINT_ID: pick('ARK_ENDPOINT_ID'),
  ARK_IMAGE_ENDPOINT_ID: pick('ARK_IMAGE_ENDPOINT_ID'),
  ARK_IMAGE_API_KEY: pick('ARK_IMAGE_API_KEY'),
  TIANAPI_KEY: pick('TIANAPI_KEY'),
  ALIYUN_ACCESS_KEY_ID: pick('ALIYUN_ACCESS_KEY_ID'),
  ALIYUN_ACCESS_KEY_SECRET: pick('ALIYUN_ACCESS_KEY_SECRET'),
  ALIYUN_ASR_APP_KEY: pick('ALIYUN_ASR_APP_KEY'),
  RESEND_API_KEY: pick('RESEND_API_KEY'),
  RESEND_FROM: pick('RESEND_FROM') || '中台 <noreply@example.com>',
  APP_PUBLIC_BASE: webPublic,
  DEV_EMAIL_MODE: pick('DEV_EMAIL_MODE') || '0',
  CORS_ALLOW_ORIGINS: webPublic,
  CENTRAL_LATEST_VERSION: pick('CENTRAL_LATEST_VERSION') || '0.1.3',
  CENTRAL_FORCE_UPDATE_BELOW: pick('CENTRAL_FORCE_UPDATE_BELOW') || '0.0.1',
  CENTRAL_UPDATE_URL: pick('CENTRAL_UPDATE_URL') || 'https://mcap-desktop-releases.oss-cn-beijing.aliyuncs.com/releases/',
  FFMPEG_MAX_CONCURRENT: '2',
}

const webEnv = {
  ZBPACK_DOCKERFILE_PATH: 'Dockerfile',
  NODE_ENV: 'production',
  NEXT_TELEMETRY_DISABLED: '1',
  PORT: '8080',
  HOSTNAME: '0.0.0.0',
  FASTAPI_URL: 'http://zhongtai-full-api.zeabur.internal:8080',
  NEXT_PUBLIC_FASTAPI_URL: apiPublic,
  NEXT_PUBLIC_DH_VIDEO_V2_MOCK: '0',
  CLOUD_API_URL: '',
  NEXT_PUBLIC_CLOUD_API_URL: '',
  APP_PUBLIC_BASE: webPublic,
  DEEPSEEK_API_KEY: pick('DEEPSEEK_API_KEY'),
  DEEPSEEK_CHAT_MODEL: pick('DEEPSEEK_CHAT_MODEL') || 'deepseek-v4-pro',
  ARK_API_KEY: pick('ARK_API_KEY'),
  ARK_BASE_URL: pick('ARK_BASE_URL') || 'https://ark.cn-beijing.volces.com/api/v3',
  ARK_CHAT_MODEL: pick('ARK_CHAT_MODEL') || 'doubao-seed-2-1-pro-260628',
  ARK_ENDPOINT_ID: pick('ARK_ENDPOINT_ID'),
  ARK_IMAGE_ENDPOINT_ID: pick('ARK_IMAGE_ENDPOINT_ID'),
  ARK_IMAGE_API_KEY: pick('ARK_IMAGE_API_KEY'),
  NEWAPI_BASE_URL: pick('NEWAPI_BASE_URL') || 'https://www.aicost.xyz',
  NEWAPI_KEY: pick('NEWAPI_KEY'),
  CREDIT_METERED_KEY: pick('CREDIT_METERED_KEY'),
  RESEND_API_KEY: pick('RESEND_API_KEY'),
  RESEND_FROM: pick('RESEND_FROM') || '中台 <noreply@example.com>',
  DEV_EMAIL_MODE: pick('DEV_EMAIL_MODE') || '0',
  EMAIL_HASH_SALT: emailSalt,
  CREDIT_ADMIN_ACCESS_KEY: pick('CREDIT_ADMIN_ACCESS_KEY'),
  ADMIN_LOGIN_NAME: pick('ADMIN_LOGIN_NAME'),
  ADMIN_PASSWORD_HASH: pick('ADMIN_PASSWORD_HASH'),
  ADMIN_PASSWORD_SALT: pick('ADMIN_PASSWORD_SALT'),
  TIANAPI_KEY: pick('TIANAPI_KEY'),
}

await upsertMany(api, apiEnv)
await upsertMany(web, webEnv)

await gql(`mutation($s:ObjectID!,$e:ObjectID!){ restartService(serviceID:$s, environmentID:$e) }`, { s: api, e: ENV_ID })
await gql(`mutation($s:ObjectID!,$e:ObjectID!){ restartService(serviceID:$s, environmentID:$e) }`, { s: web, e: ENV_ID })
console.log('restarted')

for (let i = 0; i < 30; i++) {
  const checks = []
  for (const [n,u] of [
    ['api', apiPublic + '/health'],
    ['web', webPublic + '/'],
    ['cloud', 'https://mcap-cloud-api.preview.aliyun-zeabur.cn/health'],
  ]) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(12000) })
      const t = await r.text()
      checks.push(`${n}=${r.status}${n==='api'||n==='cloud' ? ':'+t.slice(0,60).replace(/\s+/g,' ') : ''}`)
    } catch { checks.push(n+'=ERR') }
  }
  console.log(`[${i}]`, checks.join(' | '))
  if (checks[0].includes('api=200') && checks[1].startsWith('web=200')) break
  await new Promise(r => setTimeout(r, 8000))
}

const st = await gql(`query($id:ObjectID!,$e:ObjectID!){ service(_id:$id){ status variables(environmentID:$e, exposed:true){ key } } }`, {id:api,e:ENV_ID})
console.log('api status', st.data.service.status, 'env keys', st.data.service.variables.length)
