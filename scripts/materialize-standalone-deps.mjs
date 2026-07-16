#!/usr/bin/env node
/**
 * 将 pnpm symlink 依赖物化到 resources/next-standalone/node_modules/
 * 可在不跑完整 pnpm build 时单独修复 standalone（例如 robocopy 后补依赖）。
 */

import { existsSync, mkdirSync, cpSync, rmSync, readdirSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const targetArg = process.argv[2];
const target = targetArg
  ? path.resolve(projectRoot, targetArg)
  : path.join(projectRoot, 'resources', 'next-standalone');
const RUNTIME_PNPM_PACKAGES = ['@swc/helpers', 'styled-jsx', '@next/env', 'react', 'react-dom'];

function copyPkgToStandalone(destRoot, srcPath, destRel) {
  const dest = path.join(destRoot, ...destRel.split('/'));
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(srcPath, dest, { recursive: true, dereference: true });
  console.log(`[materialize-standalone-deps] copied: ${destRel}`);
}

function resolveFromPnpmStore(nodeModulesRoot, pkgPath) {
  const pnpmDir = path.join(nodeModulesRoot, '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  for (const entry of readdirSync(pnpmDir)) {
    const candidate = path.join(pnpmDir, entry, 'node_modules', ...pkgPath.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return null;
}

if (!existsSync(path.join(target, 'server.js'))) {
  console.error(`[materialize-standalone-deps] FAIL: ${target}/server.js missing`);
  process.exit(1);
}

const destRoot = path.join(target, 'node_modules');
mkdirSync(destRoot, { recursive: true });

for (const pkg of RUNTIME_PNPM_PACKAGES) {
  const destPath = path.join(destRoot, ...pkg.split('/'));
  if (existsSync(path.join(destPath, 'package.json'))) {
    console.log(`[materialize-standalone-deps] skip (exists): ${pkg}`);
    continue;
  }

  let src =
    resolveFromPnpmStore(destRoot, pkg) ||
    (existsSync(path.join(projectRoot, 'node_modules', ...pkg.split('/')))
      ? realpathSync(path.join(projectRoot, 'node_modules', ...pkg.split('/')))
      : null);

  if (!src) {
    console.error(`[materialize-standalone-deps] FAIL: cannot find ${pkg}`);
    process.exit(1);
  }
  copyPkgToStandalone(destRoot, src, pkg);
}

console.log('[materialize-standalone-deps] OK');
