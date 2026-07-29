import type { BrowserWindow } from 'electron';

export const RENDERER_NETWORK_LOG_PREFIX = '[client-network-error]';
const MAX_RENDERER_NETWORK_LOG_LENGTH = 1024;

function stripUrlSecrets(value: string): string {
  return value.replace(/https?:\/\/[^\s"'<>]+/gi, (raw) => {
    try {
      const url = new URL(raw);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return raw.split(/[?#]/, 1)[0];
    }
  });
}

export function sanitizeRendererNetworkLogMessage(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const normalized = input.replace(/[\r\n\t]+/g, ' ').trim();
  if (!normalized.startsWith(RENDERER_NETWORK_LOG_PREFIX)) return null;

  let safe = stripUrlSecrets(normalized);
  const sensitiveAssignment = safe.match(
    /["']?(authorization|set-cookie|cookie|password|passwd|access[_-]?token|token|api[_-]?key|secret|key)["']?\s*[:=]/i,
  );
  if (sensitiveAssignment?.index !== undefined) {
    safe = `${safe.slice(0, sensitiveAssignment.index)}${sensitiveAssignment[1]}: [REDACTED]`;
    return safe.slice(0, MAX_RENDERER_NETWORK_LOG_LENGTH);
  }
  safe = safe.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [REDACTED]');
  return safe.slice(0, MAX_RENDERER_NETWORK_LOG_LENGTH);
}

type RendererNetworkLogSink = (message: string) => void;

export function attachRendererNetworkLogBridge(
  win: Pick<BrowserWindow, 'webContents'>,
  persist: RendererNetworkLogSink,
): void {
  win.webContents.on('console-message', (_event, _level, message) => {
    const safe = sanitizeRendererNetworkLogMessage(message);
    if (safe) persist(safe);
  });
}
