/**
 * 子进程环境变量注入器
 *
 * 注入顺序（后覆盖前）：
 * 1. baseEnv（spawn 时传入的固定 env，如路径变量）
 * 2. .env 文件（resources/.env，生产机部署用）
 * 3. credential-store（云端 /api/config/sync 下发的 Key，如果有）
 *
 * 三选 failover 由共享业务代码读取 env 实现（非 Electron 专有逻辑）：
 * - Seedance：lib/dh_video_v2_service.list_seedance_endpoints()
 * - NewAPI：lib/llm/sonetto-client.listNewApiRelayEndpoints()
 * - 豆包：lib/llm/ark-client（ARK_API_KEY / ARK_CHAT_MODEL / ARK_BASE_URL，可由 sync 下发）
 */

import { loadCredentials } from './credential-store';
import { loadDotEnv } from './env-loader';
import logger from './logger';

/** 分镜 plan-script 所需：至少一项非空 */
export const PLAN_LLM_KEY_CANDIDATES = [
  'NEWAPI_KEY',
  'SONETTO_GPT_API_KEY',
  'SONETTO_CLAUDE_API_KEY',
  'DEEPSEEK_API_KEY',
] as const;

export function hasPlanLlmKeys(env: Record<string, string | undefined>): boolean {
  return PLAN_LLM_KEY_CANDIDATES.some((k) => Boolean((env[k] || '').trim()));
}

export function presentPlanLlmKeyNames(env: Record<string, string | undefined>): string[] {
  return PLAN_LLM_KEY_CANDIDATES.filter((k) => Boolean((env[k] || '').trim()));
}

/**
 * 为子进程 env 注入 API Key
 * `baseEnv` 是 spawn 时传入的固定 env（如 DATA_DIR、FFMPEG_EXE 等路径变量）
 * 返回完整 env 对象
 */
export async function injectApiKeys(baseEnv: Record<string, string>): Promise<Record<string, string>> {
  const merged: Record<string, string> = { ...baseEnv };

  // 1. 从 .env 文件读取（优先级中）
  const dotEnv = loadDotEnv();
  for (const [k, v] of Object.entries(dotEnv)) {
    if (v && typeof v === 'string') {
      merged[k] = v;
    }
  }

  // 2. 从 credential-store 读取（优先级高，覆盖 .env）
  const creds = loadCredentials();
  if (creds && creds.keys) {
    for (const [k, v] of Object.entries(creds.keys)) {
      if (v && typeof v === 'string') {
        merged[k] = v;
      }
    }
  }

  const planKeys = presentPlanLlmKeyNames(merged);
  if (planKeys.length) {
    logger.info('env-injector: plan-script LLM keys present: ' + planKeys.join(', '));
  } else {
    logger.warn(
      'env-injector: plan-script LLM keys MISSING (need NEWAPI_KEY or DEEPSEEK_API_KEY). ' +
        '分镜将返回 503，直到云端 /api/config/sync 下发后重启子进程。',
    );
  }
  logger.info('env-injector: injected ' + Object.keys(merged).length + ' env vars');
  return merged;
}
