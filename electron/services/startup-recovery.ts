import type { MessageBoxOptions } from 'electron';

export const STARTUP_RECOVERY_DIALOG: MessageBoxOptions = {
  type: 'error',
  title: '启动失败',
  message: '本地服务未能启动',
  detail: '请一键重启程序。如果问题仍然存在，请联系管理员。',
  buttons: ['一键重启程序', '退出程序'],
  defaultId: 0,
  cancelId: 1,
  noLink: true,
};

export interface StartupRecoveryDependencies {
  showMessageBox: (options: MessageBoxOptions) => Promise<{ response: number }>;
  restartApp: () => Promise<unknown>;
  exitApp: () => Promise<void> | void;
}

export async function handleStartupFailure(
  deps: StartupRecoveryDependencies,
): Promise<'restart' | 'exit'> {
  const { response } = await deps.showMessageBox(STARTUP_RECOVERY_DIALOG);
  if (response === 0) {
    await deps.restartApp();
    return 'restart';
  }
  await deps.exitApp();
  return 'exit';
}
