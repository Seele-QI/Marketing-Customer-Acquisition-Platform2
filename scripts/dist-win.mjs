#!/usr/bin/env node
/**
 * Windows 安装包完整出包：重建运行资源 → dir → 写 exe 图标 → NSIS
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, { cwd: projectRoot, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('pnpm', ['resources:build']);
run('pnpm', ['electron:build']);
run('npx', ['electron-builder', '--win', '--dir', '--publish', 'never']);
run('node', ['scripts/patch-exe-icon.mjs']);
run('node', [
  'scripts/generate-app-update-config.mjs',
  '--resources',
  'release/win-unpacked/resources',
]);
run('npx', ['electron-builder', '--win', 'nsis', '--prepackaged', 'release/win-unpacked', '--publish', 'never']);

console.log('\n[dist:win] done');
console.log('[dist:win] 若需上传 OSS: pnpm release:upload-oss（见 docs/deploy/DESKTOP-UPDATE-OSS.md）');
