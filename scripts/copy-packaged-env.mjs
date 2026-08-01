#!/usr/bin/env node
/**
 * 生成 Electron 安装包 resources/.env。
 *
 * 本地桌面：从项目根 .env 复制 bootstrap 变量（含 EMAIL_HASH_SALT 等），
 * uvicorn 在登录前即需这些变量才能通过 /health。
 * 登录后 credential-store（云端 /api/config/sync）注入的 Key 优先级更高，可覆盖同名项。
 *
 * 三选 failover 运行时逻辑见：
 * - lib/dh_video_v2_service.py（Seedance primary → secondary → tertiary）
 * - lib/llm/sonetto-client.ts（NewAPI primary → secondary → tertiary）
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envSrc = path.join(projectRoot, '.env');
const resourcesDir = path.join(projectRoot, 'resources');
const envDst = path.join(resourcesDir, '.env');

/** 与 zhongtai-cloud/contracts/CONFIG_KEYS.md 白名单对齐（仅注释，不含值） */
const CLOUD_SYNC_KEY_COMMENTS = `
# ── 以下 Key 也可由云端 POST /api/config/sync 下发（与 Zeabur CONFIG_KEY_POOL 同步）──
# 登录后 credential-store 注入子进程，覆盖本文件中同名项。
#
# NewAPI 三选（LLM failover）：
# NEWAPI_KEY / NEWAPI_BASE_URL / NEWAPI_GPT_MODEL / NEWAPI_CLAUDE_MODEL
# NEWAPI_SECONDARY_KEY / NEWAPI_SECONDARY_BASE_URL / NEWAPI_SECONDARY_GPT_MODEL / NEWAPI_SECONDARY_CLAUDE_MODEL
# NEWAPI_TERTIARY_KEY / NEWAPI_TERTIARY_BASE_URL / NEWAPI_TERTIARY_GPT_MODEL / NEWAPI_TERTIARY_CLAUDE_MODEL
#
# Seedance 三选（数字人视频 failover）：
# SEEDANCE_PRIMARY_API_KEY / SEEDANCE_PRIMARY_BASE_URL / SEEDANCE_PRIMARY_MODEL / SEEDANCE_PRIMARY_MEDIA_MODE
# SEEDANCE_SECONDARY_API_KEY / SEEDANCE_SECONDARY_BASE_URL / SEEDANCE_SECONDARY_MODEL / SEEDANCE_SECONDARY_MEDIA_MODE
# SEEDANCE_TERTIARY_API_KEY / SEEDANCE_TERTIARY_BASE_URL / SEEDANCE_TERTIARY_MODEL / SEEDANCE_TERTIARY_MEDIA_MODE
# SEEDANCE_API_KEY / SEEDANCE_BASE_URL（secondary 兼容别名）
# XINGHE_API_KEY / XINGHE_BASE_URL（tertiary 兼容别名）
#
# 图片工作台与视频封面图（海外图片服务）：
# RUNNINGHUB_API_KEY / RUNNINGHUB_IMAGE_API_KEY / RUNNINGHUB_IMAGE_BASE_URL
# RunningHub 国内工作流与海外图片服务固定使用本地 resources/.env，云端快照不覆盖。
#
# 数字人创作超时（秒，默认 3000 = 50 分钟）：
# DH_V2_TASK_TIMEOUT / DH_V2_SEGMENT_POLL_TIMEOUT
`.trim();

/** 不写入安装包的前端/开发专用变量 */
const SKIP_KEYS = new Set([
  'NEXT_PUBLIC_FASTAPI_URL',
  'FASTAPI_URL',
  'PORT',
  'NODE_ENV',
]);

function parseDotEnv(content) {
  const config = {};
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key && val) config[key] = val;
  }
  return config;
}

mkdirSync(resourcesDir, { recursive: true });

const parsed = existsSync(envSrc) ? parseDotEnv(readFileSync(envSrc, 'utf8')) : {};
// 未配置时不写入占位 URL，Next 会回退到本地 FastAPI（127.0.0.1:8010）处理登录/注册
delete parsed.CLOUD_API_URL;
if (existsSync(envSrc)) {
  const srcText = readFileSync(envSrc, 'utf8');
  for (const line of srcText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (key !== 'CLOUD_API_URL') continue;
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1).trim();
    }
    if (val && !val.includes('你的域名')) {
      parsed.CLOUD_API_URL = val;
    }
    break;
  }
}

const lines = [
  '# 招财猫桌面客户端 — 打包环境（构建机 project/.env 生成，勿提交真实 Key 到 git）',
  '# uvicorn 启动前即需 EMAIL_HASH_SALT 等；登录后云端 sync 可覆盖 API Key',
  '',
];

const writtenKeys = [];
for (const key of Object.keys(parsed).sort()) {
  if (SKIP_KEYS.has(key)) continue;
  lines.push(`${key}=${parsed[key]}`);
  writtenKeys.push(key);
}

lines.push('', CLOUD_SYNC_KEY_COMMENTS, '');

writeFileSync(envDst, lines.join('\n'), 'utf8');
const cloudNote = parsed.CLOUD_API_URL ? parsed.CLOUD_API_URL : '(未设置，账号走本地 FastAPI)';
console.log(
  `[copy-packaged-env] OK: resources/.env (${writtenKeys.length} keys, CLOUD_API_URL=${cloudNote})`,
);
