import { randomUUID } from "node:crypto";

import { pool } from "../db/pool.js";

function toUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    tenantId: row.tenant_id,
    createdAt: row.created_at.toISOString(),
  };
}

function toUserWithHash(row) {
  return { ...toUser(row), passwordHash: row.password_hash };
}

/** Postgres-backed user storage (app_users). Every user is their own
 * tenant (see init-node-platform.sql) - there's no shared team/org
 * membership model yet. */
export class UserRepository {
  async create({ name, email, passwordHash }) {
    const id = `user_${randomUUID()}`;
    const tenantId = id;
    const { rows } = await pool.query(
      `INSERT INTO app_users (id, name, email, password_hash, tenant_id)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, name, email.toLowerCase(), passwordHash, tenantId],
    );
    return toUser(rows[0]);
  }

  /** Includes passwordHash - only auth.service.js's login check should
   * ever call this; everything else should use findById. */
  async findByEmail(email) {
    const { rows } = await pool.query("SELECT * FROM app_users WHERE email = $1", [email.toLowerCase()]);
    return rows[0] ? toUserWithHash(rows[0]) : undefined;
  }

  async findById(id) {
    const { rows } = await pool.query("SELECT * FROM app_users WHERE id = $1", [id]);
    return rows[0] ? toUser(rows[0]) : undefined;
  }

  /** Dev/test only - never called from application request handling. */
  async clear() {
    await pool.query("TRUNCATE app_users CASCADE");
  }
}

export const userRepository = new UserRepository();
