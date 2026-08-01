import { app } from 'electron';
import * as path from 'node:path';

import { loadOrCreateDistributionSecret } from '../utils/distribution-secret';
import { getMachineId } from './machine-id';
import logger from './logger';

export function ensureDistributionSecret(): string {
  const file = path.join(app.getPath('userData'), 'distribution-secret.bin');
  const secret = loadOrCreateDistributionSecret(file, getMachineId());
  logger.info('distribution secret: ready');
  return secret;
}

