import { createHash, randomBytes } from "node:crypto";

/** A session token is a random opaque bearer credential, exactly like an
 * API key - the value itself given to the browser. */
export function generateSessionToken() {
  return randomBytes(32).toString("hex");
}

/** Only this hash is ever persisted (see session.repository.js) - the
 * same reasoning as a password hash: a database compromise should not
 * itself grant every currently-active session. */
export function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}
