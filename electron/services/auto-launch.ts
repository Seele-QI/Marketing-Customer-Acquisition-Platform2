/**
 * 自启动管理
 *
 * 用 Electron 内置 `app.setLoginItemSettings`（Windows 写 HKCU\...\Run）。
 * MVP：默认开启，托盘菜单可切换。不引入 `auto-launch` 包。
 *
 * 注意：Win11 22H2 上 `openAsHidden` 有时失效，MVP 不传。
 */

import { app } from 'electron';
import logger from './logger';

export function setAutoLaunch(enabled: boolean): void {
  try {
    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: false, // MVP 不带 hide，等用户反馈
    });
    logger.info(`autoLaunch: ${enabled}`);
  } catch (err) {
    logger.error('setLoginItemSettings failed:', err);
  }
}

export function isAutoLaunchEnabled(): boolean {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch {
    return false;
  }
}