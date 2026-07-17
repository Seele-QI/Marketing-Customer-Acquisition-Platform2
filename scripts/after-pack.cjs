/**
 * electron-builder afterPack（Darwin）：
 * - 清理 Resources 内逃出 .app 的 symlink
 * - 为 runtime 二进制补可执行位
 * - 去掉与当前 Electron arch 无关的 runtime，减小体积
 */

const {
  chmodSync,
  existsSync,
  lstatSync,
  readlinkSync,
  readdirSync,
  realpathSync,
  rmSync,
  unlinkSync,
  cpSync,
} = require('node:fs');
const path = require('node:path');

/** builder-util Arch: x64=1 arm64=3 */
const ARCH_X64 = 1;
const ARCH_ARM64 = 3;

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

function scrubPythonPkgconfig(pythonRoot) {
  const pkgconfig = path.join(pythonRoot, 'lib', 'pkgconfig');
  if (existsSync(pkgconfig)) {
    rmSync(pkgconfig, { recursive: true, force: true });
  }
}

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

function keepRuntimeForArch(runtimeRoot, arch) {
  if (!existsSync(runtimeRoot)) return;
  const keep =
    arch === ARCH_ARM64 ? 'darwin-arm64' : arch === ARCH_X64 ? 'darwin-x64' : null;
  if (!keep) return;
  for (const name of readdirSync(runtimeRoot)) {
    if (name === keep) continue;
    rmSync(path.join(runtimeRoot, name), { recursive: true, force: true });
    console.log(`[after-pack] dropped unused runtime/${name}`);
  }
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appBundle = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );
  const resourcesDir = path.join(appBundle, 'Contents', 'Resources');
  const runtimeRoot = path.join(resourcesDir, 'runtime');
  const nextStandalone = path.join(resourcesDir, 'next-standalone');

  neutralizeEscapingSymlinks(appBundle, nextStandalone, `next-standalone arch=${context.arch}`);
  neutralizeEscapingSymlinks(appBundle, resourcesDir, `resources arch=${context.arch}`);

  keepRuntimeForArch(runtimeRoot, context.arch);

  const keepFolder =
    context.arch === ARCH_ARM64
      ? 'darwin-arm64'
      : context.arch === ARCH_X64
        ? 'darwin-x64'
        : null;
  if (keepFolder) {
    const py = path.join(runtimeRoot, keepFolder, 'python');
    scrubPythonPkgconfig(py);
  }

  if (existsSync(runtimeRoot)) {
    chmodRuntimeBinaries(runtimeRoot);
  }
};
