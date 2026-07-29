import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

const UPDATER_CACHE_DIR_NAME = 'cuocuo-ai-updater';

export type UpdateConfigResolution = {
  path: string;
  source: 'packaged' | 'fallback';
};

type EnsureUpdateConfigOptions = {
  packagedConfigPath: string;
  fallbackConfigPath: string;
  feedUrl: string;
};

function normalizedHttpsFeed(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(String(raw || '').trim());
  } catch {
    throw new Error('更新配置缺失，请运行更新修复工具或覆盖安装新版客户端');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('更新配置缺失，请运行更新修复工具或覆盖安装新版客户端');
  }
  parsed.hash = '';
  parsed.search = '';
  return `${parsed.toString().replace(/\/+$/, '')}/`;
}

function field(text: string, name: string): string {
  const match = text.match(new RegExp(`^\\s*${name}\\s*:\\s*(.*?)\\s*$`, 'm'));
  return String(match?.[1] || '')
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

function isValidConfig(text: string): boolean {
  try {
    return (
      field(text, 'provider') === 'generic' &&
      Boolean(normalizedHttpsFeed(field(text, 'url'))) &&
      field(text, 'updaterCacheDirName') === UPDATER_CACHE_DIR_NAME
    );
  } catch {
    return false;
  }
}

function renderConfig(feedUrl: string): string {
  return [
    'provider: generic',
    `url: ${normalizedHttpsFeed(feedUrl)}`,
    `updaterCacheDirName: ${UPDATER_CACHE_DIR_NAME}`,
    '',
  ].join('\n');
}

export function ensureUpdateConfigPath({
  packagedConfigPath,
  fallbackConfigPath,
  feedUrl,
}: EnsureUpdateConfigOptions): UpdateConfigResolution {
  if (existsSync(packagedConfigPath)) {
    const packaged = readFileSync(packagedConfigPath, 'utf8');
    if (isValidConfig(packaged)) {
      return { path: packagedConfigPath, source: 'packaged' };
    }
  }

  const content = renderConfig(feedUrl);
  if (existsSync(fallbackConfigPath)) {
    const fallback = readFileSync(fallbackConfigPath, 'utf8');
    if (isValidConfig(fallback) && fallback === content) {
      return { path: fallbackConfigPath, source: 'fallback' };
    }
  }

  const directory = path.dirname(fallbackConfigPath);
  mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(
    directory,
    `.app-update.yml.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    writeFileSync(temporaryPath, content, 'utf8');
    if (!isValidConfig(readFileSync(temporaryPath, 'utf8'))) {
      throw new Error('更新配置生成失败，请覆盖安装新版客户端');
    }
    if (existsSync(fallbackConfigPath)) rmSync(fallbackConfigPath, { force: true });
    renameSync(temporaryPath, fallbackConfigPath);
  } finally {
    if (existsSync(temporaryPath)) rmSync(temporaryPath, { force: true });
  }

  return { path: fallbackConfigPath, source: 'fallback' };
}
