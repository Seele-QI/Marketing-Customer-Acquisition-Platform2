/**
 * 日志收集与导出
 *
 * - 一键导出：压缩 userData/logs/ 下所有 .log 文件为 zip
 * - 附带脱敏的 machine-info.txt
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { app, dialog } from 'electron';
import logger from './logger';

/** 导出日志包到用户选择的目录 */
export async function exportLogs() {
  try {
    const logsDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logsDir)) {
      dialog.showErrorBox('导出失败', '日志目录不存在，请先启动程序');
      return;
    }

    // 获取所有日志文件
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.endsWith('.log'))
      .map((f) => ({ name: f, path: path.join(logsDir, f) }));

    if (files.length === 0) {
      dialog.showErrorBox('导出失败', '暂无日志文件');
      return;
    }

    // 生成脱敏 machine-info.txt
    const info = buildMachineInfo();
    const infoPath = path.join(logsDir, '_machine-info.txt');
    fs.writeFileSync(infoPath, info, 'utf-8');

    // 打包 zip
    const defaultName = `zhongtai-logs-${formatTimestamp(new Date())}.zip`;

    // 用 archiver 库打包（如果未安装则用简易文本方式）
    const archiver = tryRequireArchiver();
    if (archiver) {
      await exportAsZip(logsDir, defaultName, archiver);
    } else {
      await exportAsTextBundle(logsDir, defaultName, files);
    }

    // 清理临时文件
    try { fs.unlinkSync(infoPath); } catch {}

    logger.info('logs exported successfully');
  } catch (err) {
    logger.error('exportLogs:', err);
    dialog.showErrorBox('导出失败', (err as Error).message);
  }
}

function tryRequireArchiver(): any {
  try { return require('archiver'); } catch { return null; }
}

async function exportAsZip(logsDir: string, defaultName: string, archiver: any) {
  const savePath = await dialog.showSaveDialog({
    title: '导出日志包',
    defaultPath: defaultName,
    filters: [{ name: 'ZIP 文件', extensions: ['zip'] }],
  });
  if (!savePath.filePath) return;

  const output = fs.createWriteStream(savePath.filePath);
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(output);
  archive.directory(logsDir, false);
  await archive.finalize();

  dialog.showMessageBox({
    type: 'info',
    title: '导出完成',
    message: `日志已导出到：\n${savePath.filePath}`,
  });
}

async function exportAsTextBundle(logsDir: string, defaultName: string, files: { name: string; path: string }[]) {
  // 简易方案：把所有日志拼成一个 .txt 文件
  const savePath = await dialog.showSaveDialog({
    title: '导出日志文件',
    defaultPath: defaultName.replace('.zip', '.txt'),
    filters: [{ name: '文本文件', extensions: ['txt'] }],
  });
  if (!savePath.filePath) return;

  const out = fs.createWriteStream(savePath.filePath, { encoding: 'utf-8' });
  out.write(`招财猫 日志导出 ${new Date().toISOString()}\n\n`);
  for (const f of files) {
    out.write(`\n=== ${f.name} ===\n`);
    out.write(fs.readFileSync(f.path, 'utf-8'));
  }
  out.end();

  dialog.showMessageBox({
    type: 'info',
    title: '导出完成',
    message: `日志已导出到：\n${savePath.filePath}`,
  });
}

function buildMachineInfo(): string {
  const lines = [
    `操作系统: ${os.type()} ${os.release()} ${os.arch()}`,
    `主机名: ${os.hostname()}`,
    `CPU: ${os.cpus()[0]?.model || 'unknown'}`,
    `内存: ${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
    `Electron: ${process.versions.electron}`,
    `Node: ${process.versions.node}`,
    `App 版本: ${app.getVersion()}`,
    `导出于: ${new Date().toISOString()}`,
  ];
  return lines.join('\n') + '\n';
}

function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/* ============ 日志查看器（Windows 资源管理器打开） ============ */

export function openLogsFolder() {
  const logsDir = path.join(app.getPath('userData'), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  const { shell } = require('electron');
  shell.openPath(logsDir);
}