import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

/**
 * scrypt is Node's own built-in, OWASP-recommended choice for password
 * hashing - no extra dependency, and its memory-hardness makes brute
 * force meaningfully more expensive than a plain fast hash. A fresh
 * random salt per password is stored alongside the derived hash as
 * "salt:hash" hex - the plaintext password itself is never persisted or
 * logged anywhere.
 */
export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time comparison (timingSafeEqual) so a failed check never
 * leaks how many leading bytes matched via response-time differences. */
export async function verifyPassword(password, stored) {
  const [saltHex, hashHex] = (stored ?? "").split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, expected.length);
  return timingSafeEqual(derived, expected);
}
