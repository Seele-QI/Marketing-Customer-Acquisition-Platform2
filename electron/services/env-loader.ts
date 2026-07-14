/**
 * .env 文件加载器
 *
 * 从 resources/.env 文件读取环境变量（生产机部署用）
 * .env 文件格式：KEY=VALUE，每行一个，支持 # 注释
 * 如果文件不存在或读取失败，返回空对象
 */

import * as path from 'node:path';
import * as fs from 'node:fs';
import logger from './logger';
import { resourcesRoot } from '../utils/paths';

export interface EnvConfig {
  [key: string]: string;
}

/** 解析 .env 文本为键值对（支持 # 注释与引号） */
export function parseDotEnvContent(content: string): EnvConfig {
  const config: EnvConfig = {};

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;

    const key = trimmed.substring(0, eqIndex).trim();
    let value = trimmed.substring(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.substring(1, value.length - 1);
    }

    if (key) {
      config[key] = value;
    }
  }

  return config;
}

/**
 * 从 resources/.env 文件加载环境变量
 */
export function loadDotEnv(): EnvConfig {
  const envPath = path.join(resourcesRoot(), '.env');

  if (!fs.existsSync(envPath)) {
    logger.info('env-loader: .env file not found at ' + envPath);
    return {};
  }

  try {
    const content = fs.readFileSync(envPath, 'utf-8');
    const config = parseDotEnvContent(content);
    logger.info('env-loader: loaded ' + Object.keys(config).length + ' vars from ' + envPath);
    return config;
  } catch (err) {
    logger.error('env-loader: failed to load .env file:', err);
    return {};
  }
}
