/**
 * 将 resources/.env（构建时从项目根 .env 复制）合并进 process.env。
 * 必须在读取 CENTRAL_SERVICE_URL / CLOUD_API_URL 等变量之前调用。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import logger from './logger';
import { parseDotEnvContent } from './env-loader';

function isPackagedApp(): boolean {
  try {
    return app.isPackaged;
  } catch {
    return false;
  }
}

function resolveEnvFilePath(): string | null {
  if (isPackagedApp()) {
    const packaged = path.join(process.resourcesPath, '.env');
    return fs.existsSync(packaged) ? packaged : null;
  }

  const candidates = [
    path.join(process.cwd(), 'resources', '.env'),
    path.join(process.cwd(), '.env'),
  ];
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

/** 把打包 .env 写入 process.env（后写覆盖先写，确保安装包内配置生效） */
export function applyPackagedEnvToProcess(): void {
  const envPath = resolveEnvFilePath();
  if (!envPath) {
    logger.info('packaged-env: no .env found (dev may use shell env)');
    return;
  }

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const config = parseDotEnvContent(content);
    let applied = 0;
    for (const [key, value] of Object.entries(config)) {
      if (!key || !value) continue;
      process.env[key] = value;
      applied++;
    }
    logger.info(`packaged-env: applied ${applied} vars from ${envPath}`);
  } catch (err) {
    logger.error('packaged-env: failed to load .env:', err);
  }
}
