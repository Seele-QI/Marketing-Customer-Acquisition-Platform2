/**
 * Electron 主进程入口
 *
 * 阶段 1：单实例锁 + 主窗口 + 子进程拉起
 * 阶段 3：托盘 / 自启动 / 关窗拦截（本次）
 * 阶段 7：首次启动 → 弹向导（待补）
 */

import { app, BrowserWindow, ipcMain, type BrowserWindowConstructorOptions, dialog } from "electron";
import * as path from "node:path";
import logger from "./services/logger";
import { childManager, registerQuitHook } from "./services/child-process-manager";
import { TrayController, type TrayOptions } from "./services/tray-controller";
import { setAutoLaunch, isAutoLaunchEnabled } from "./services/auto-launch";
import { exportLogs, openLogsFolder } from "./services/log-collector";
import { injectApiKeys } from "./services/env-injector";
import {
  resourcesRoot,
  NEXT_PORT,
  UVICORN_PORT,
  bgmDir,
  videoCacheDir,
  videoPostprocessDir,
  accountsDbPath,
  ffmpegBinDir,
  pythonRoot,
  nextStandaloneRoot,
  writePorts,
} from "./utils/paths";
import { findFreePort as findAvailablePort } from "./utils/port-finder";

/* ============ 初始化 ============ */

if (process.platform === "win32") {
  app.setAppUserModelId("com.aimarketing.zhongtai");
}

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: TrayController | null = null;
let isQuitting = false;

/* ============ 单实例锁 ============ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn("another instance is running, quit");
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  bootstrap();
}

/* ============ 主流程 ============ */

async function bootstrap() {
  await app.whenReady();
  logger.info("app ready, isDev=" + isDev);

  // 退出钩子（kill 子进程）
  registerQuitHook();

  // 自启动（默认开启）
  if (!isAutoLaunchEnabled()) {
    setAutoLaunch(true);
  }

  // 自动检测可用端口
  let actualNextPort = NEXT_PORT;
  let actualUvicornPort = UVICORN_PORT;
  try {
    actualNextPort = await findAvailablePort(NEXT_PORT);
    actualUvicornPort = await findAvailablePort(UVICORN_PORT);
    logger.info(`ports allocated: next=${actualNextPort}, uvicorn=${actualUvicornPort}`);
  } catch (err) {
    logger.error("port allocation failed:", err);
    dialog.showErrorBox("端口分配失败", `无法找到可用端口：${(err as Error).message}`);
    app.quit();
    return;
  }

  // 端口记录
  writePorts(actualNextPort, actualUvicornPort);

  // 主窗口
  mainWindow = createMainWindow();

  // 托盘
  const trayOpts: TrayOptions = {
    mainWindow,
    onShow: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    onQuit: () => quitApp(),
    onShowLogs: () => {
      openLogsFolder();
    },
    onExportLogs: () => {
      exportLogs().catch((e: Error) => logger.error("export logs:", e));
    },
  };
  tray = new TrayController(trayOpts);
  tray.init();

  // 日志 IPC
  ipcMain.handle("open-logs-folder", () => openLogsFolder());
  ipcMain.handle("export-logs", () => exportLogs());

  // 子进程
  try {
    await startChildren(actualNextPort, actualUvicornPort);
  } catch (err) {
    logger.error("failed to start child processes:", err);
    dialog.showErrorBox(
      "启动失败",
      `无法启动后端服务，请检查日志：\n${path.join(app.getPath("userData"), "logs")}\n\n错误：${(err as Error).message}`,
    );
    app.quit();
    return;
  }

  // 加载 Web UI
  mainWindow.loadURL(`http://127.0.0.1:${actualNextPort}`);
}

/* ============ 主窗口 ============ */

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: "AI营销获客中台",
    backgroundColor: "#0a0a0a",
    show: false,
    autoHideMenuBar: !isDev,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.once("ready-to-show", () => win.show());

  // 阶段 3：关闭 → 隐藏到托盘
  win.on("close", (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide();
      tray?.notify("AI营销获客中台", "已最小化到托盘，右键托盘图标可退出");
      return false;
    }
    return true;
  });

  win.on("closed", () => {
    mainWindow = null;
  });

  return win;
}

/* ============ 子进程 ============ */

async function startChildren(nextPort: number, uvicornPort: number) {
  if (isDev) {
    const projectRoot = process.cwd();
    await childManager.start({
      name: "next",
      command: "pnpm",
      args: ["exec", "next", "dev", "--port", String(nextPort)],
      cwd: projectRoot,
      env: { NODE_ENV: "development", PORT: String(nextPort) },
      port: nextPort,
      startupTimeoutMs: 60_000,
    });
    await childManager.start({
      name: "uvicorn",
      command: "python",
      args: ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(uvicornPort), "--no-access-log"],
      cwd: projectRoot,
      env: { NODE_ENV: "production", PYTHONUNBUFFERED: "1", PORT: String(uvicornPort) },
      port: uvicornPort,
      healthUrl: `http://127.0.0.1:${uvicornPort}/api/auth/me`,
      startupTimeoutMs: 30_000,
    });
  } else {
    const exeExt = process.platform === "win32" ? ".exe" : "";
    await childManager.start({
      name: "next",
      command: process.execPath,
      args: [path.join(nextStandaloneRoot(), "server.js")],
      cwd: nextStandaloneRoot(),
      env: { NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: String(nextPort) },
      port: nextPort,
      startupTimeoutMs: 60_000,
    });
    await childManager.start({
      name: "uvicorn",
      command: path.join(pythonRoot(), `python${exeExt}`),
      args: ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", String(uvicornPort), "--no-access-log"],
      cwd: resourcesRoot(),
      env: {
        NODE_ENV: "production",
        PYTHONUNBUFFERED: "1",
        PORT: String(uvicornPort),
        FFMPEG_EXE: path.join(ffmpegBinDir(), `ffmpeg${exeExt}`),
        FFPROBE_EXE: path.join(ffmpegBinDir(), `ffprobe${exeExt}`),
        CREDIT_DB_OVERRIDE: accountsDbPath(),
        DATA_DIR: videoCacheDir(),
        VIDEO_BGM_DIR: bgmDir(),
        VIDEO_POSTPROCESS_DIR: videoPostprocessDir(),
      },
      port: uvicornPort,
      healthUrl: `http://127.0.0.1:${uvicornPort}/api/auth/me`,
      startupTimeoutMs: 30_000,
    });
  }
}

/* ============ 退出 ============ */

async function quitApp() {
  logger.info("quit initiated by tray");
  isQuitting = true;
  tray?.destroy();
  tray = null;
  await childManager.stopAll();
  app.exit(0);
}

// 所有窗口关闭不退出（关窗 = 隐藏到托盘）
app.on("window-all-closed", () => {
  // macOS 保持 app 存活，Windows 也不退出（托盘存活）
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

/* ============ 进程级错误处理 ============ */

process.on("unhandledRejection", (reason) => {
  logger.error("unhandledRejection:", reason);
});

process.on("uncaughtException", (err) => {
  logger.error("uncaughtException:", err);
});
