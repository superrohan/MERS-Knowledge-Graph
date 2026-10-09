import { randomUUID } from "node:crypto";

import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";

const app = createApp();

function uniqueEmail() {
  return `auth-test-${randomUUID()}@example.com`;
}

describe("POST /api/auth/register", () => {
  it("creates a real account and returns a usable session token", async () => {
    const email = uniqueEmail();
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Ada Lovelace", email, password: "correct-horse-battery-staple" });

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: "Ada Lovelace", email });
    expect(res.body.user.id).toMatch(/^user_/);
    // The password (or anything derived from it) must never come back.
    expect(JSON.stringify(res.body)).not.toContain("correct-horse-battery-staple");
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "First", email, password: "correct-horse-battery-staple" });

    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Second", email, password: "another-strong-password" });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_TAKEN");
  });

  it("rejects a password shorter than 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Short Pass", email: uniqueEmail(), password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a malformed email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ name: "Bad Email", email: "not-an-email", password: "correct-horse-battery-staple" });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login", () => {
  it("logs in with the correct password", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Login Test", email, password: "correct-horse-battery-staple" });

    const res = await request(app).post("/api/auth/login").send({ email, password: "correct-horse-battery-staple" });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
  });

  it("rejects the wrong password", async () => {
    const email = uniqueEmail();
    await request(app).post("/api/auth/register").send({ name: "Wrong Pass", email, password: "correct-horse-battery-staple" });

    const res = await request(app).post("/api/auth/login").send({ email, password: "totally-wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rejects an unknown email with the same error as a wrong password (no account enumeration)", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: uniqueEmail(), password: "whatever-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
  });
});

describe("GET /api/auth/me", () => {
  it("returns the authenticated user", async () => {
    const email = uniqueEmail();
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ name: "Me Test", email, password: "correct-horse-battery-staple" });

    const res = await request(app).get("/api/auth/me").set("Authorization", `Bearer ${registered.body.token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Me Test", email });
  });

  it("rejects a missing token", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage token", async () => {
    const res = await request(app).get("/api/auth/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});

describe("POST /api/auth/logout", () => {
  it("invalidates the session so it can no longer be used", async () => {
    const email = uniqueEmail();
    const registered = await request(app)
      .post("/api/auth/register")
      .send({ name: "Logout Test", email, password: "correct-horse-battery-staple" });
    const authHeader = `Bearer ${registered.body.token}`;

    const before = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(before.status).toBe(200);

    const logoutRes = await request(app).post("/api/auth/logout").set("Authorization", authHeader);
    expect(logoutRes.status).toBe(204);

    const after = await request(app).get("/api/auth/me").set("Authorization", authHeader);
    expect(after.status).toBe(401);
  });
});

describe("Protected routes require a real session", () => {
  it("rejects an application-list request with no token", async () => {
    const res = await request(app).get("/api/applications");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });
});
