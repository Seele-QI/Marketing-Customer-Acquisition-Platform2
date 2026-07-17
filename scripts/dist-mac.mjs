/**
 * macOS 安装包出包：unsigned arm64 + x64 DMG（非 universal lipo）
 *
 * 前置：在 darwin 上完成 pnpm resources:build && pnpm preflight
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

function run(cmd, args, env = {}) {
  console.log(`\n> ${cmd} ${args.join(' ')}`);
  const r = spawnSync(cmd, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, ...env },
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (process.platform !== 'darwin') {
  console.error('[dist:mac] must run on macOS (use GitHub Actions macos runner)');
  process.exit(1);
}

const icns = path.join(projectRoot, 'build', 'icon.icns');
if (!existsSync(icns)) {
  console.log('[dist:mac] icon.icns missing — generating via icons:build');
  run('node', ['scripts/build-icons.mjs']);
}

run('pnpm', ['electron:build']);
run('npx', ['electron-builder', '--mac', 'dmg', '--arm64', '--x64', '--publish', 'never'], {
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
});

console.log('\n[dist:mac] done');
console.log('[dist:mac] 产物：release/*-mac-arm64.dmg 与 release/*-mac-x64.dmg');
console.log('[dist:mac] Gatekeeper 见 docs/deploy/ELECTRON-BUILD-MAC.md');
