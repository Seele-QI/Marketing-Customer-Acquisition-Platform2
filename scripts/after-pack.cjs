/**
 * electron-builder afterPack：为 Darwin 内嵌二进制补可执行位。
 */

const { chmodSync, existsSync, readdirSync, statSync } = require('node:fs');
const path = require('node:path');

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
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
    console.log('[after-pack] no runtime/ under Resources, skip chmod');
    return;
  }

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
