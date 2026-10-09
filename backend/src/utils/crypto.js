import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { env } from "../config/env.js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey() {
  const key = Buffer.from(env.tokenEncryptionKey, "hex");
  if (key.length !== 32) {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters). Generate one with `openssl rand -hex 32`.",
    );
  }
  return key;
}

/**
 * AES-256-GCM encrypts a secret (a GitLab access token, most notably)
 * before it's ever written to a database row - a database export/backup
 * or read-only compromise never hands over a usable credential. Output
 * is self-contained (random IV + auth tag + ciphertext, all in one
 * base64 string), so no extra columns are needed to decrypt it later.
 */
export function encryptSecret(plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptSecret(). Throws if the key is wrong or the value was
 * tampered with (GCM's auth tag check fails) - never silently returns
 * corrupted plaintext. */
export function decryptSecret(stored) {
  const raw = Buffer.from(stored, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
