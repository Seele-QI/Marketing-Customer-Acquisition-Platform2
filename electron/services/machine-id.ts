/**
 * 机器指纹获取（node-machine-id 封装）
 *
 * - 主方案：读主板序列号（windows hash）
 * - fallback：hostname + MAC + OS-UUID 拼接 hash
 */

import { createHash } from 'node:crypto';
import { hostname } from 'node:os';
import logger from './logger';

let _cached: string | null = null;

/** 获取稳定机器指纹（懒加载 + 缓存）
 *  主方案：node-machine-id（需要 asarUnpack + ASCII 安装路径）
 *  fallback：hostname + env hash（路径含中文等原生模块加载失败时自动降级）
 */
export function getMachineId(): string {
  if (_cached) return _cached;

  try {
    // 动态 require，避免模块加载失败时整个进程崩溃
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { machineIdSync } = require('node-machine-id') as typeof import('node-machine-id');
    _cached = machineIdSync(true);
    if (!_cached || _cached.length < 16) throw new Error('too short');
    logger.info('machine-id: hw-based');
  } catch (err) {
    logger.warn('machine-id: hw failed, using fallback', err);
    _cached = fallbackId();
  }

  return _cached;
}

function fallbackId(): string {
  const raw = `${hostname()}-${process.env.COMPUTERNAME || ''}-${process.env.USERNAME || ''}`;
  return createHash('sha256').update(raw).digest('hex');
}

/** 获取用于展示的前 8 位 + 后 4 位 */
export function getMachineIdShort(): string {
  const id = getMachineId();
  return `${id.slice(0, 8)}…${id.slice(-4)}`;
}