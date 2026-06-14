import crypto from "node:crypto";
import { config } from "./config";

const KEY = Buffer.from(config.embyEncKey, "hex");
if (KEY.length !== 32) {
  throw new Error(
    `EMBY_ENC_KEY must be 32 bytes (64 hex chars); got ${KEY.length} bytes. Generate with: openssl rand -hex 32`,
  );
}

/**
 * AES-256-GCM encrypt a secret (e.g. an Emby access token / password) for storage.
 * Output: base64( iv[12] | authTag[16] | ciphertext ).
 */
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString("base64");
}

export function decryptSecret(blob: string): string {
  const raw = Buffer.from(blob, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
