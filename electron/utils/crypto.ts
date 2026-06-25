/**
 * AES-256-GCM + HKDF 工具（凭证加密）
 *
 * 格式：userData/credentials.bin =
 *   [12B iv][16B gcm-tag][N B ciphertext(json)]
 *
 * 算法：
 * - 密钥派生：HKDF-SHA256(machine_id, salt='zhongtai-v1', info='credentials') → 32B
 * - 加密：AES-256-GCM，随机 IV
 * - 解密：GCM tag 校验 → 失败说明凭证被篡改或换机器
 */

import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;

export function deriveKey(machineId: string): Buffer {
  return Buffer.from(
    hkdfSync('sha256', machineId, 'zhongtai-v1-salt', 'credentials', KEY_LEN),
  );
}

export function encryptCredentials(plaintext: string, machineId: string): Buffer {
  const key = deriveKey(machineId);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]); // [12][16][N]
}

export function decryptCredentials(blob: Buffer, machineId: string): string {
  const key = deriveKey(machineId);
  const iv = blob.subarray(0, IV_LEN);
  const tag = blob.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = blob.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}