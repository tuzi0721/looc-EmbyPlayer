import crypto from "node:crypto";
import { config } from "./config";

// Redemption code: BBBB-BBBB-BBBB-CC
// - 12 random chars (unambiguous alphabet) + 2-char HMAC checksum.
// - The checksum makes codes tamper-evident offline; real validity is DB-backed
//   (问7 云端生成 → 本地用 → 云端校验): redeemed / revoked / expired are checked
//   server-side at redemption time.
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

function randomBlock(len: number): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function checksum(body: string): string {
  const mac = crypto.createHmac("sha256", config.codeSignSecret).update(body).digest();
  return ALPHABET[mac[0]! % ALPHABET.length]! + ALPHABET[mac[1]! % ALPHABET.length]!;
}

export function generateCode(): string {
  const body = `${randomBlock(4)}-${randomBlock(4)}-${randomBlock(4)}`;
  return `${body}-${checksum(body)}`;
}

/** Offline shape + checksum check. Does NOT prove the code exists/unused. */
export function isCodeShapeValid(code: string): boolean {
  const normalized = code.trim().toUpperCase();
  const m = /^([A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4})-([A-Z2-9]{2})$/.exec(normalized);
  if (!m) return false;
  return checksum(m[1]!) === m[2]!;
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}
