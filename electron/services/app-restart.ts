export interface RestartAppDependencies {
  beginQuit: () => void;
  stopScheduler: () => void;
  stopChildren: () => Promise<void>;
  onStopError?: (error: unknown) => void;
  relaunch: () => void;
  exit: (code: number) => void;
}

/** Returns a single-flight restart handler suitable for an IPC endpoint. */
export function createRestartAppHandler(deps: RestartAppDependencies): () => Promise<{ ok: true }> {
  let inFlight: Promise<{ ok: true }> | null = null;

  return () => {
    if (inFlight) return inFlight;
    const operation = (async () => {
      deps.beginQuit();
      deps.stopScheduler();
      try {
        await deps.stopChildren();
      } catch (error) {
        deps.onStopError?.(error);
      }
      deps.relaunch();
      deps.exit(0);
      return { ok: true as const };
    })();
    const tracked = operation.finally(() => {
      if (inFlight === tracked) inFlight = null;
    });
    inFlight = tracked;
    return inFlight;
  };
}
