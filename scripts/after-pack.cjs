/**
 * electron-builder afterPack：
 * - 清理 Darwin runtime 断链 / pkgconfig（避免 electron-universal ENOENT）
 * - 为内嵌二进制补可执行位
 */

const {
  chmodSync,
  existsSync,
  lstatSync,
  readdirSync,
  rmSync,
  unlinkSync,
} = require('node:fs');
const path = require('node:path');

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

function scrubRuntime(runtimeRoot) {
  let removedLinks = 0;
  let removedDirs = 0;

  for (const arch of ['darwin-arm64', 'darwin-x64']) {
    const pkgconfig = path.join(runtimeRoot, arch, 'python', 'lib', 'pkgconfig');
    if (existsSync(pkgconfig)) {
      rmSync(pkgconfig, { recursive: true, force: true });
      removedDirs++;
    }
  }

  for (const full of walkEntries(runtimeRoot)) {
    try {
      const st = lstatSync(full);
      if (!st.isSymbolicLink()) continue;
      if (!existsSync(full)) {
        unlinkSync(full);
        removedLinks++;
      }
    } catch {
      // ignore
    }
  }

  console.log(
    `[after-pack] scrubbed runtime: dirs=${removedDirs}, danglingLinks=${removedLinks}`,
  );
}

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = lstatSync(full);
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

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const resourcesDir = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
    'Contents',
    'Resources',
  );

  const runtimeRoot = path.join(resourcesDir, 'runtime');
  if (!existsSync(runtimeRoot)) {
    console.log('[after-pack] no runtime/ under Resources, skip');
    return;
  }

  scrubRuntime(runtimeRoot);

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
};
