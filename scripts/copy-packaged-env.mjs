#!/usr/bin/env node
/**
 * 将项目根 .env 复制到 resources/.env，供 Electron 安装包 extraResources 打包。
 *
 * 触发：pnpm resources:build（dist:win 之前）
 */

import { existsSync, mkdirSync, copyFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const envSrc = path.join(projectRoot, '.env');
const resourcesDir = path.join(projectRoot, 'resources');
const envDst = path.join(resourcesDir, '.env');

if (!existsSync(envSrc)) {
  console.error('[copy-packaged-env] FATAL: .env not found at project root');
  console.error(`  Expected: ${envSrc}`);
  console.error('  Create .env from .env.example before pnpm resources:build');
  process.exit(1);
}

mkdirSync(resourcesDir, { recursive: true });
copyFileSync(envSrc, envDst);

const kb = (statSync(envDst).size / 1024).toFixed(1);
console.log(`[copy-packaged-env] OK: .env → resources/.env (${kb} KB)`);
