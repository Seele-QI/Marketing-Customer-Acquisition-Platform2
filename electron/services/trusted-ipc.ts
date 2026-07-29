export interface TrustedWebContentsLike {
  getURL?: () => string;
}

export interface TrustedWindowLike {
  isDestroyed: () => boolean;
  webContents: TrustedWebContentsLike;
}

export interface IpcEventLike {
  sender: unknown;
  senderFrame?: { url?: string } | null;
}

export function isTrustedRendererUrl(url: string, expectedOrigin: string): boolean {
  try {
    const actual = new URL(url);
    const expected = new URL(expectedOrigin);
    if (expected.protocol === 'file:') {
      return actual.protocol === 'file:' && actual.pathname === expected.pathname;
    }
    return actual.origin === expected.origin;
  } catch {
    return false;
  }
}

export function isTrustedIpcEvent(
  event: IpcEventLike,
  win: TrustedWindowLike | null,
  expectedOrigin: string,
): boolean {
  if (!win || win.isDestroyed() || event.sender !== win.webContents) return false;
  const senderUrl = event.senderFrame?.url || win.webContents.getURL?.() || '';
  return isTrustedRendererUrl(senderUrl, expectedOrigin);
}
