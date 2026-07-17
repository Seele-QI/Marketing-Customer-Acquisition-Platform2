/**
 * electron-builder afterPack（Darwin）：
 *
 * universal 合并会 follow symlink 并统计 Mach-O。pnpm/Next standalone 里常有
 * 指回构建机 `.next/standalone` 的外链，两侧解析结果不一致就会报 Mach-O mismatch。
 *
 * 策略：
 * - 单架构临时包：去掉 runtime/；把 Resources 内“逃出 .app”的 symlink 物化或删除
 * - universal 最终包：再拷回 resources/runtime 并 chmod
 */

const {
  chmodSync,
  cpSync,
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
} = require('node:fs');
const path = require('node:path');

/** builder-util Arch: ia32=0 x64=1 armv7l=2 arm64=3 universal=4 */
const ARCH_UNIVERSAL = 4;

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

function scrubPythonPkgconfig(runtimeRoot) {
  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const pkgconfig = path.join(runtimeRoot, arch, 'python', 'lib', 'pkgconfig');
    if (existsSync(pkgconfig)) {
      rmSync(pkgconfig, { recursive: true, force: true });
    }
  }
}

/**
 * 物化/删除逃出 appRoot 的 symlink（含仍能解析到构建机 .next 的“假活链”）。
 * 长路径优先，避免先删父链。
 */
function neutralizeEscapingSymlinks(appRoot, scanRoot, label) {
  if (!existsSync(scanRoot)) return;
  const appRootReal = realpathSync(appRoot);
  const entries = walkEntries(scanRoot).sort((a, b) => b.length - a.length);
  let materialized = 0;
  let removed = 0;

  for (const full of entries) {
    let st;
    try {
      st = lstatSync(full);
    } catch {
      continue;
    }
    if (!st.isSymbolicLink()) continue;

    let target;
    try {
      target = readlinkSync(full);
    } catch {
      continue;
    }

    const resolved = path.resolve(path.dirname(full), target);
    let escapes = true;
    let resolvedExists = false;
    try {
      if (existsSync(resolved)) {
        resolvedExists = true;
        const real = realpathSync(resolved);
        escapes = !real.startsWith(appRootReal + path.sep) && real !== appRootReal;
      }
    } catch {
      escapes = true;
      resolvedExists = false;
    }

    // 断链，或解析到 .app 外：都不能留给 electron-universal
    if (!resolvedExists || escapes) {
      try {
        unlinkSync(full);
      } catch {
        continue;
      }
      if (resolvedExists && escapes) {
        try {
          cpSync(resolved, full, { recursive: true });
          materialized++;
          continue;
        } catch {
          removed++;
          continue;
        }
      }
      removed++;
    }
  }

  console.log(
    `[after-pack] ${label}: materialized=${materialized}, removedEscapingOrDangling=${removed}`,
  );
}

function resourcesDirOf(context) {
  return path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );
}

function appBundleOf(context) {
  return path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appBundle = appBundleOf(context);
  const resourcesDir = resourcesDirOf(context);
  const runtimeInApp = path.join(resourcesDir, 'runtime');
  const nextStandalone = path.join(resourcesDir, 'next-standalone');
  const projectRuntime = path.join(context.packager.projectDir, 'resources', 'runtime');

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
    neutralizeEscapingSymlinks(appBundle, runtimeInApp, 'runtime');
    chmodRuntimeBinaries(runtimeInApp);
    return;
  }

  // 单架构临时包：先去 runtime，再处理 next-standalone 外链
  if (existsSync(runtimeInApp)) {
    rmSync(runtimeInApp, { recursive: true, force: true });
    console.log(`[after-pack] stripped runtime/ from arch=${context.arch} temp app`);
  }

  neutralizeEscapingSymlinks(appBundle, nextStandalone, `next-standalone arch=${context.arch}`);
  neutralizeEscapingSymlinks(appBundle, resourcesDir, `resources arch=${context.arch}`);
};
