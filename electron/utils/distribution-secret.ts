import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

import { decryptCredentials, encryptCredentials } from './crypto';

type DistributionSecretPayload = {
  version: 1;
  secret: string;
};

function createSecret(file: string, machineId: string): string {
  const secret = randomBytes(32).toString('base64url');
  const payload: DistributionSecretPayload = { version: 1, secret };
  const encrypted = encryptCredentials(JSON.stringify(payload), machineId);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encrypted, { mode: 0o600 });
  return secret;
}

/**
 * 读取当前安装的分发密钥；首次启动、文件损坏或设备变化时生成新密钥。
 * 磁盘文件使用项目现有的机器绑定 AES-256-GCM 工具加密。
 */
export function loadOrCreateDistributionSecret(file: string, machineId: string): string {
  if (fs.existsSync(file)) {
    try {
      const plain = decryptCredentials(fs.readFileSync(file), machineId);
      const payload = JSON.parse(plain) as Partial<DistributionSecretPayload>;
      if (payload.version === 1 && typeof payload.secret === 'string' && payload.secret.length >= 32) {
        return payload.secret;
      }
    } catch {
      // 无法解密表示文件损坏或已迁移到另一设备；下方轮换并要求重新绑定平台账号。
    }
  }
  return createSecret(file, machineId);
}

