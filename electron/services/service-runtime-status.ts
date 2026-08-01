export type ServiceRuntimeState = 'idle' | 'updating' | 'ready' | 'failed';

export type ServiceRuntimeStatus = {
  state: ServiceRuntimeState;
  updatedAt: string;
  configVersion?: string;
  message?: string;
};

export function createServiceRuntimeStatus(
  state: ServiceRuntimeState,
  options: Pick<ServiceRuntimeStatus, 'configVersion' | 'message'> = {},
): ServiceRuntimeStatus {
  return {
    state,
    updatedAt: new Date().toISOString(),
    ...(options.configVersion ? { configVersion: options.configVersion } : {}),
    ...(options.message ? { message: options.message } : {}),
  };
}
