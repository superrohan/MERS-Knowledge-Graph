import { randomUUID } from "node:crypto";

import request from "supertest";

/**
 * Registers a fresh test user against the given app instance and
 * returns its session - every protected-route test needs a real,
 * logged-in session now that auth is real (Postgres-backed), not a
 * fixed mocked identity. A random email per call keeps tests
 * independent of each other without needing shared fixture cleanup.
 */
export async function registerTestUser(app, overrides = {}) {
  const email = overrides.email ?? `test-${randomUUID()}@example.com`;
  const res = await request(app)
    .post("/api/auth/register")
    .send({
      name: overrides.name ?? "Test User",
      email,
      password: overrides.password ?? "correct-horse-battery-staple",
    });
  if (res.status !== 201) {
    throw new Error(`Failed to register test user: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token, user: res.body.user, authHeader: `Bearer ${res.body.token}` };
}
