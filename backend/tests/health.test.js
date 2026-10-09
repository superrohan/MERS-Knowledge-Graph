import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { registerTestUser } from "./helpers/authUser.js";

describe("GET /health", () => {
  it("reports the service as healthy", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("backend");
  });

  it("echoes a request id on every response", async () => {
    const app = createApp();
    const res = await request(app).get("/health");

    expect(res.headers["x-request-id"]).toBeTruthy();
  });

  // /health itself needs no auth (used for container/orchestrator
  // liveness checks), but every other route does - including ones that
  // don't exist, so an unauthenticated caller learns nothing about which
  // routes are real.
  it("rejects an unknown route with 401 when unauthenticated", async () => {
    const app = createApp();
    const res = await request(app).get("/does-not-exist");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("returns a structured 404 for an unknown route once authenticated", async () => {
    const app = createApp();
    const { authHeader } = await registerTestUser(app);
    const res = await request(app).get("/does-not-exist").set("Authorization", authHeader);

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });
});
