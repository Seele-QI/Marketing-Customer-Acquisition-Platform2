/**
 * electron-builder afterPack（Darwin）：
 *
 * universal 合并会扫描整个 .app 内 Mach-O。我们的 runtime/ 含双架构
 * Python/ffmpeg，两边数量不一致时会直接失败。
 *
 * 策略：
 * - 单架构临时包：先移除 Resources/runtime，并清理 next-standalone 断链
 * - universal 最终包：再从仓库 resources/runtime 拷回并 chmod
 */

const {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  unlinkSync,
} = require('node:fs');
const path = require('node:path');

/** app-builder-lib Arch.universal */
const ARCH_UNIVERSAL = 3;

function walkEntries(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    out.push(full);
    try {
      const st = lstatSync(full);
      if (st.isDirectory() && !st.isSymbolicLink()) walkEntries(full, out);
    } catch {
      // ignore
    }
  }
  return out;
}

function scrubDanglingSymlinks(root, label) {
  if (!existsSync(root)) return 0;
  let removed = 0;
  for (const full of walkEntries(root)) {
    try {
      const st = lstatSync(full);
      if (!st.isSymbolicLink()) continue;
      if (!existsSync(full)) {
        unlinkSync(full);
        removed++;
      }
    } catch {
      // ignore
    }
  }
  if (removed > 0) {
    console.log(`[after-pack] removed ${removed} dangling symlink(s) under ${label}`);
  }
  return removed;
}

function scrubPythonPkgconfig(runtimeRoot) {
  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const pkgconfig = path.join(runtimeRoot, arch, 'python', 'lib', 'pkgconfig');
    if (existsSync(pkgconfig)) {
      rmSync(pkgconfig, { recursive: true, force: true });
    }
  }
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (st.isSymbolicLink()) continue;
    if (st.isDirectory()) walkFiles(full, out);
    else out.push(full);
  }
  return out;
}

function ensureExec(filePath) {
  try {
    chmodSync(filePath, 0o755);
  } catch {
    // ignore
  }
}

function chmodRuntimeBinaries(runtimeRoot) {
  const names = new Set(['python', 'python3', 'ffmpeg', 'ffprobe']);
  let n = 0;
  for (const file of walkFiles(runtimeRoot)) {
    const base = path.basename(file);
    if (names.has(base) || base.startsWith('python3.')) {
      ensureExec(file);
      n++;
    }
  }
  console.log(`[after-pack] chmod +x on ${n} darwin runtime binaries`);
}

function resourcesDirOf(context) {
  return path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const resourcesDir = resourcesDirOf(context);
  const runtimeInApp = path.join(resourcesDir, 'runtime');
  const nextStandalone = path.join(resourcesDir, 'next-standalone');
  const projectRuntime = path.join(context.packager.projectDir, 'resources', 'runtime');

  // next-standalone 里 pnpm 断链会导致 universal 两侧“可见文件”不一致
  scrubDanglingSymlinks(nextStandalone, 'next-standalone');

  if (context.arch === ARCH_UNIVERSAL) {
    if (!existsSync(projectRuntime)) {
      throw new Error(`[after-pack] missing project runtime at ${projectRuntime}`);
    }
    if (existsSync(runtimeInApp)) {
      rmSync(runtimeInApp, { recursive: true, force: true });
    }
    console.log('[after-pack] restoring runtime/ into universal app');
    cpSync(projectRuntime, runtimeInApp, { recursive: true });
    scrubPythonPkgconfig(runtimeInApp);
    scrubDanglingSymlinks(runtimeInApp, 'runtime');
    chmodRuntimeBinaries(runtimeInApp);
    return;
  }

  // 单架构临时包：去掉 runtime，避免 universal 合并扫到双架构 Mach-O
  if (existsSync(runtimeInApp)) {
    rmSync(runtimeInApp, { recursive: true, force: true });
    console.log(`[after-pack] stripped runtime/ from arch=${context.arch} temp app`);
  }
};
