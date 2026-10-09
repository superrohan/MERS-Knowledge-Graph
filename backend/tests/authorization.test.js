import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import { applicationRepository } from "../src/repositories/application.repository.js";
import { registerTestUser } from "./helpers/authUser.js";

const app = createApp();
let authHeader;

beforeEach(async () => {
  await applicationRepository.clear();
  ({ authHeader } = await registerTestUser(app));
});

describe("GET /api/applications/:id/authorizations", () => {
  it("returns dummy authorization data for the application's AA number", async () => {
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "Payment Platform", aaNumber: "AA-12345", repositoryUrl: "https://gitlab.com/team/payment-platform" });

    const res = await request(app)
      .get(`/api/applications/${created.body.id}/authorizations`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body.aaNumber).toBe("AA-12345");
    expect(res.body.source).toBe("dummy");
    expect(res.body.authorizations.length).toBeGreaterThan(0);
    expect(res.body.authorizations[0]).toMatchObject({
      code: expect.any(String),
      name: expect.any(String),
      description: expect.any(String),
      requiredRole: expect.any(String),
    });
  });

  it("requires authentication", async () => {
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "Payment Platform", aaNumber: "AA-12345", repositoryUrl: "https://gitlab.com/team/payment-platform" });

    const res = await request(app).get(`/api/applications/${created.body.id}/authorizations`);
    expect(res.status).toBe(401);
  });

  it("404s for an application the caller doesn't own / doesn't exist", async () => {
    const res = await request(app)
      .get("/api/applications/app_does-not-exist/authorizations")
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });

  it("never leaks another user's application's authorization data", async () => {
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "Payment Platform", aaNumber: "AA-12345", repositoryUrl: "https://gitlab.com/team/payment-platform" });

    const other = await registerTestUser(app);
    const res = await request(app)
      .get(`/api/applications/${created.body.id}/authorizations`)
      .set("Authorization", other.authHeader);

    expect(res.status).toBe(404);
  });
});
