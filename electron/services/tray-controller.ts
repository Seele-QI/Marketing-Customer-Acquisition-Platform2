/**
 * 系统托盘控制器
 *
 * 菜单结构：
 * ├─ 打开主面板
 * ├──────
 * ├─ 开机自启
 * ├─ 开机最小化到托盘
 * ├──────
 * ├─ 打开日志
 * ├─ 导出日志包
 * ├──────
 * ├─ 关于
 * ├──────
 * └─ 退出
 */

import { Tray, Menu, nativeImage, app, type BrowserWindow, type MenuItemConstructorOptions } from 'electron';
import * as path from 'node:path';
import logger from './logger';

export interface TrayOptions {
  mainWindow: BrowserWindow;
  onShow: () => void;
  onQuit: () => void;
  onShowLogs: () => void;
  onExportLogs: () => void;
}

export class TrayController {
  private tray: Tray | null = null;
  private opts: TrayOptions;
  private _autoLaunch = true;
  private _minimizeToTray = true;

  constructor(opts: TrayOptions) {
    this.opts = opts;
  }

  get autoLaunch() { return this._autoLaunch; }
  get minimizeToTray() { return this._minimizeToTray; }

  init() {
    const icon = this.createTrayIcon();
    this.tray = new Tray(icon);
    this.tray.setToolTip('AI营销获客中台');
    this.updateMenu();
    this.tray.on('double-click', () => this.opts.onShow());
  }

  private createTrayIcon(): Electron.NativeImage {
    const iconPaths = [
      path.join(__dirname, '..', '..', '..', 'build', 'tray-icon.png'),
      path.join(__dirname, '..', '..', 'build', 'tray-icon.png'),
    ];
    for (const p of iconPaths) {
      try {
        const img = nativeImage.createFromPath(p);
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
      } catch {}
    }
    const buf = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < 16 * 16; i++) {
      buf[i * 4 + 0] = 59;
      buf[i * 4 + 1] = 130;
      buf[i * 4 + 2] = 246;
      buf[i * 4 + 3] = 255;
    }
    return nativeImage.createFromBuffer(buf, { width: 16, height: 16 });
  }

  private updateMenu() {
    if (!this.tray) return;

    const template: MenuItemConstructorOptions[] = [
      {
        label: '打开主面板',
        click: () => this.opts.onShow(),
      },
      { type: 'separator' },
      {
        type: 'checkbox',
        label: '开机自启',
        checked: this._autoLaunch,
        click: (item) => {
          this._autoLaunch = item.checked;
          logger.info('autoLaunch: ' + this._autoLaunch);
        },
      },
      {
        type: 'checkbox',
        label: '开机最小化到托盘',
        checked: this._minimizeToTray,
        click: (item) => {
          this._minimizeToTray = item.checked;
          logger.info('minimizeToTray: ' + this._minimizeToTray);
        },
      },
      { type: 'separator' },
      {
        label: '打开日志',
        click: () => this.opts.onShowLogs(),
      },
      {
        label: '导出日志包 (.zip)',
        click: () => this.opts.onExportLogs(),
      },
      { type: 'separator' },
      {
        label: '关于',
        click: () => {
          const { dialog } = require('electron');
          dialog.showMessageBox({
            type: 'info',
            title: '关于 AI营销获客中台',
            message: 'AI营销获客中台 v' + app.getVersion(),
            detail: 'AI 视频创作中台 · 桌面版',
          });
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => this.opts.onQuit(),
      },
    ];

    const menu = Menu.buildFromTemplate(template);
    this.tray.setContextMenu(menu);
  }

  refresh() {
    this.updateMenu();
  }

  notify(title: string, body: string) {
    this.tray?.displayBalloon({ title, content: body, iconType: 'info' });
  }

  destroy() {
    this.tray?.destroy();
    this.tray = null;
  }
}
