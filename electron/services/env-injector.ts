/**
 * 子进程环境变量注入器
 *
 * 注入顺序（后覆盖前）：
 * 1. baseEnv（spawn 时传入的固定 env，如路径变量）
 * 2. .env 文件（resources/.env，生产机部署用）
 * 3. credential-store（激活码绑定的 Key，如果有）
 */

import { loadCredentials } from './credential-store';
import { loadDotEnv } from './env-loader';
import logger from './logger';

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

  logger.info('env-injector: injected ' + Object.keys(merged).length + ' env vars');
  return merged;
}
