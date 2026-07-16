/**
 * 剥离 Windows/系统残留代理，避免 Node fetch / Python 出站误走坏代理。
 * spawn 时必须在 `{...process.env, ...spec.env}` 合并之后再调一次。
 */

const PROXY_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
] as const;

export function stripSystemProxy<T extends Record<string, string | undefined>>(
  env: T,
): T & { NO_PROXY: string } {
  const next = { ...env } as T & { NO_PROXY: string };
  for (const key of PROXY_KEYS) {
    delete next[key];
  }
  next.NO_PROXY = '*';
  return next;
}
