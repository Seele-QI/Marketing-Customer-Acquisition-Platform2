const ALLOWED_CATEGORIES = new Set([
  'network',
  'local_service',
  'cloud_service',
  'timeout',
  'unknown',
]);

export type ClientErrorCategory =
  | 'network'
  | 'local_service'
  | 'cloud_service'
  | 'timeout'
  | 'unknown';

export type SanitizedClientErrorReport = {
  category: ClientErrorCategory;
  requestPath: string;
  status?: number;
  timestamp: string;
};

function sanitizeRequestPath(input: unknown): string {
  if (typeof input !== 'string') return '/';
  const normalized = input.replace(/[\r\n\t]/g, '').trim();
  if (!normalized) return '/';
  try {
    return new URL(normalized, 'http://electron.local').pathname.slice(0, 256) || '/';
  } catch {
    return (normalized.split(/[?#]/, 1)[0] || '/').slice(0, 256);
  }
}

export function sanitizeClientErrorReport(input: unknown): SanitizedClientErrorReport | null {
  if (!input || typeof input !== 'object') return null;
  const source = input as Record<string, unknown>;
  if (typeof source.category !== 'string' || !ALLOWED_CATEGORIES.has(source.category)) return null;

  const parsedDate = new Date(
    typeof source.timestamp === 'string' || typeof source.timestamp === 'number'
      ? source.timestamp
      : Date.now(),
  );
  const timestamp = Number.isNaN(parsedDate.getTime())
    ? new Date().toISOString()
    : parsedDate.toISOString();
  const status = typeof source.status === 'number'
    && Number.isInteger(source.status)
    && source.status >= 100
    && source.status <= 599
      ? source.status
      : undefined;

  return {
    category: source.category as ClientErrorCategory,
    requestPath: sanitizeRequestPath(source.requestPath),
    ...(status ? { status } : {}),
    timestamp,
  };
}
