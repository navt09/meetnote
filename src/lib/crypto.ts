import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash, timingSafeEqual } from "node:crypto";

/**
 * Encrypts third-party credentials before they touch the database, so a
 * database dump alone doesn't hand over anyone's Linear or Google account.
 *
 * AES-256-GCM. The stored string is  v1.<iv>.<authTag>.<ciphertext>,  each part
 * base64url. GCM authenticates, so tampering fails to decrypt rather than
 * silently returning garbage.
 *
 * The key comes from CREDENTIALS_KEY. Generate one with:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 * Losing it means every stored connection must be reconnected; it does not
 * lose meetings, notes or tasks.
 */

const VERSION = "v1";

function key(): Buffer {
  const raw = process.env.CREDENTIALS_KEY;
  if (!raw) throw new Error("CREDENTIALS_KEY is not set; cannot store third-party credentials");
  // Accept base64 or hex; anything else is hashed to 32 bytes so a passphrase still works.
  let buf: Buffer;
  if (/^[A-Za-z0-9+/=]+$/.test(raw) && Buffer.from(raw, "base64").length === 32) {
    buf = Buffer.from(raw, "base64");
  } else if (/^[0-9a-f]{64}$/i.test(raw)) {
    buf = Buffer.from(raw, "hex");
  } else {
    buf = createHash("sha256").update(raw).digest();
  }
  return buf;
}

export function encryptJson(value: unknown): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptJson<T>(blob: string): T {
  const parts = (blob ?? "").split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Stored credentials are in an unrecognised format");
  const [, ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

/** True when a credentials key is configured at all. */
export function credentialsKeyConfigured(): boolean {
  return !!process.env.CREDENTIALS_KEY;
}

/** Constant-time compare, for OAuth state and webhook signatures. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a ?? "", "utf8");
  const bb = Buffer.from(b ?? "", "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Shows a key as "sk-ant…4f2a" so a person can tell which one is stored. */
export function maskSecret(secret: string, lead = 6, tail = 4): string {
  const s = (secret ?? "").trim();
  if (s.length <= lead + tail) return "•".repeat(Math.max(4, s.length));
  return `${s.slice(0, lead)}…${s.slice(-tail)}`;
}
