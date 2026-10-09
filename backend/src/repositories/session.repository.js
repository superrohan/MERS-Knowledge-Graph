import { pool } from "../db/pool.js";

/** Postgres-backed session storage (app_sessions), keyed by the SHA-256
 * hash of the actual bearer token - see utils/token.js. */
export class SessionRepository {
  async create(tokenHash, userId, expiresAt) {
    await pool.query("INSERT INTO app_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)", [
      tokenHash,
      userId,
      expiresAt,
    ]);
  }

  async findByTokenHash(tokenHash) {
    const { rows } = await pool.query(
      "SELECT token_hash, user_id, expires_at FROM app_sessions WHERE token_hash = $1",
      [tokenHash],
    );
    if (rows.length === 0) return undefined;
    return { tokenHash: rows[0].token_hash, userId: rows[0].user_id, expiresAt: rows[0].expires_at };
  }

  async deleteByTokenHash(tokenHash) {
    await pool.query("DELETE FROM app_sessions WHERE token_hash = $1", [tokenHash]);
  }

  async deleteAllForUser(userId) {
    await pool.query("DELETE FROM app_sessions WHERE user_id = $1", [userId]);
  }

  /** Dev/test only - never called from application request handling. */
  async clear() {
    await pool.query("TRUNCATE app_sessions");
  }
}

export const sessionRepository = new SessionRepository();
