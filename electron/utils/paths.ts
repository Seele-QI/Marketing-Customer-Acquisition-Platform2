/**
 * 路径解析工具
 *
 * 区分三种根路径：
 * - `appRoot`     : Electron app 根（开发期 = 项目根，prod = resources/app/）
 * - `resourcesRoot`: extraResources 根（prod = resources/）
 * - `userData`    : 用户数据（prod = %APPDATA%/招财猫/）
 */

import { app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";

/**
 * 是否 dev 模式。**不能用顶层常量** `const isDev = !app.isPackaged`，
 * 因为 child-process-manager.js 在 require paths.ts 时 app 还没初始化。
 * 必须做成 lazy 函数，每次调用时再判断。
 */
function isDev(): boolean {
  // app 在 import 时可能未初始化，必须 try/catch
  try {
    return !app.isPackaged;
  } catch {
    // 未 ready 之前，假设 dev（process.cwd() 才是项目根）
    return true;
  }
}

/**
 * 资源根目录：
 * - dev: 项目根（脚本里 cwd 启动 electron 时可用 process.cwd()）
 * - prod: process.resourcesPath
 */
export function resourcesRoot(): string {
  if (isDev()) {
    return path.resolve(process.cwd(), "resources");
  }
  return process.resourcesPath;
}

/**
 * Electron app 根：
 * - dev: 项目根
 * - prod: asar 内（app.asar/）
 */
export function appRoot(): string {
  if (isDev()) return process.cwd();
  return path.dirname(app.getAppPath());
}

/**
 * 用户数据根（持久化 SQLite、上传、视频缓存、日志、凭证）
 */
export function userDataDir(): string {
  return app.getPath("userData");
}

/**
 * 日志目录
 */
export function logsDir(): string {
  const p = path.join(userDataDir(), "logs");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * 持久化数据根（SQLite、上传、视频缓存）
 */
export function dataDir(): string {
  const p = path.join(userDataDir(), "data");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * SQLite 路径（FastAPI main.py 通过 CREDIT_DB_OVERRIDE 读取）
 */
export function accountsDbPath(): string {
  return path.join(dataDir(), "accounts.db");
}

/**
 * 上传/视频缓存根（FastAPI main.py 通过 DATA_DIR 读取）
 */
export function videoCacheDir(): string {
  const p = path.join(userDataDir(), "video-cache");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * 视频剪辑中间产物根
 */
export function videoPostprocessDir(): string {
  const p = path.join(userDataDir(), "video-postprocess");
  fs.mkdirSync(p, { recursive: true });
  return p;
}

/**
 * 凭证文件路径
 */
export function credentialsPath(): string {
  return path.join(userDataDir(), "credentials.bin");
}

/**
 * 端口文件路径（写入实际使用的端口，避免每次随机）
 */
export function portsFilePath(): string {
  return path.join(userDataDir(), ".ports");
}

/**
 * Darwin 双架构目录名（universal 包内嵌两套运行时）
 */
export function darwinRuntimeFolder(): 'darwin-arm64' | 'darwin-x64' {
  return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
}

/**
 * 项目 Python 包 `lib` 的父目录（加入 PYTHONPATH，供 `from lib.xxx` 导入）。
 * - Windows embed: pythonRoot（包在 pythonRoot/lib）
 * - Darwin standalone: pythonRoot/applib（包在 applib/lib，避免覆盖 lib/python3.13）
 */
export function pythonAppLibParent(): string {
  if (process.platform === 'darwin') {
    return path.join(pythonRoot(), 'applib');
  }
  return pythonRoot();
}

/**
 * resources 内 ffmpeg 二进制目录
 */
export function ffmpegBinDir(): string {
  if (process.platform === 'darwin') {
    const dual = path.join(resourcesRoot(), 'runtime', darwinRuntimeFolder(), 'ffmpeg', 'bin');
    if (fs.existsSync(dual)) return dual;
  }
  return path.join(resourcesRoot(), 'ffmpeg', 'bin');
}

/**
 * resources 内 Python 根
 */
export function pythonRoot(): string {
  if (process.platform === 'darwin') {
    const dual = path.join(resourcesRoot(), 'runtime', darwinRuntimeFolder(), 'python');
    if (fs.existsSync(dual)) return dual;
  }
  return path.join(resourcesRoot(), 'python');
}

/**
 * resources 内 BGM 目录（FastAPI main.py 通过 VIDEO_BGM_DIR 读取）
 */
export function bgmDir(): string {
  return path.join(resourcesRoot(), "bgm");
}

/**
 * resources 内 Next.js standalone 根
 */
export function nextStandaloneRoot(): string {
  return path.join(resourcesRoot(), "next-standalone");
}

/**
 * resources 内 main.py（FastAPI 入口）
 */
export function mainPyPath(): string {
  return path.join(resourcesRoot(), "main.py");
}

/**
 * 写入端口文件
 */
export function writePorts(nextPort: number, uvicornPort: number): void {
  const content = JSON.stringify({ next: nextPort, uvicorn: uvicornPort, ts: Date.now() }, null, 2);
  fs.writeFileSync(portsFilePath(), content, "utf-8");
}

/**
 * 读端口文件（启动时复用，避免每次随机触发防火墙弹窗）
 */
export function readPorts(): { next: number; uvicorn: number } | null {
  try {
    const content = fs.readFileSync(portsFilePath(), "utf-8");
    const parsed = JSON.parse(content);
    if (typeof parsed.next === "number" && typeof parsed.uvicorn === "number") {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 端口分配策略：固定 3010 / 8010，如占用则抛错让用户处理。
 * 不随机端口，避免 Windows 防火墙每次弹窗。
 */
export const NEXT_PORT = 3010;
export const UVICORN_PORT = 8010;

/**
 * resources 中 .env 文件路径
 */
export function envFilePath(): string {
  return path.join(resourcesRoot(), ".env");
}
