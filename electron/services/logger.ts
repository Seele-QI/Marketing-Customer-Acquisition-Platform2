/**
 * 主进程日志（简单文件日志，无外部依赖）
 *
 * - 文件路径：<userData>/logs/main.log
 * - 也保留 console.* 输出
 */

import { app } from 'electron';
import * as path from 'node:path';
import * as fs from 'node:fs';

function logDir(): string {
  const p = path.join(app.getPath('userData'), 'logs');
  fs.mkdirSync(p, { recursive: true });
  return p;
}

function writeLog(level: string, ...args: unknown[]) {
  const ts = new Date().toISOString();
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
  const line = "[" + ts + "] [" + level.toUpperCase() + "] " + msg + "\n";
  try {
    fs.appendFileSync(path.join(logDir(), 'main.log'), line, 'utf-8');
  } catch {}
  const fn = level === 'error' ? console.error
           : level === 'warn'  ? console.warn
           :                     console.log;
  fn(msg);
}

const logger = {
  debug: (...args: unknown[]) => writeLog('debug', ...args),
  info: (...args: unknown[]) => writeLog('info', ...args),
  warn: (...args: unknown[]) => writeLog('warn', ...args),
  error: (...args: unknown[]) => writeLog('error', ...args),
  errorHandler: {
    startCatching: () => {},
  },
  transports: {
    file: { level: 'info', fileName: 'main' },
    console: { level: 'debug' },
  },
  initialize: () => {},
};

export default logger;
