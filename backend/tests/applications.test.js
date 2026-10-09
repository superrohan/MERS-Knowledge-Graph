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

const validPayload = {
  name: "Payment Platform",
  aaNumber: "AA-12345",
  repositoryUrl: "https://gitlab.com/team/payment-platform",
  branch: "main",
};

describe("POST /api/applications", () => {
  it("creates an application with NEW status and zeroed stats", async () => {
    const res = await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Payment Platform",
      aaNumber: "AA-12345",
      status: "NEW",
      stats: { files: 0, symbols: 0, relationships: 0, chunks: 0 },
    });
    expect(res.body.repositories).toEqual([
      {
        id: expect.any(String),
        name: "main",
        repoKey: "main",
        repositoryUrl: "https://gitlab.com/team/payment-platform",
        branch: "main",
        isPrivate: false,
      },
    ]);
    expect(res.body.id).toMatch(/^app_/);
  });

  it("defaults branch to main when omitted", async () => {
    const { branch, ...payload } = validPayload;
    const res = await request(app).post("/api/applications").set("Authorization", authHeader).send(payload);
    expect(res.body.repositories[0].branch).toBe("main");
  });

  it("accepts multiple repositories and assigns each a distinct repoKey", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({
        name: "Payment Platform",
        aaNumber: "AA-12345",
        repositories: [
          { name: "Frontend", repositoryUrl: "https://gitlab.com/team/payment-frontend", branch: "main" },
          { name: "Backend", repositoryUrl: "https://gitlab.com/team/payment-backend" },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.repositories).toHaveLength(2);
    expect(res.body.repositories.map((r) => r.repoKey)).toEqual(["frontend", "backend"]);
    expect(res.body.repositories[1].branch).toBe("main");
  });

  it("rejects a multi-repo submission where a repo is missing a name", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({
        name: "Payment Platform",
        aaNumber: "AA-12345",
        repositories: [
          { name: "Frontend", repositoryUrl: "https://gitlab.com/team/payment-frontend" },
          { repositoryUrl: "https://gitlab.com/team/payment-backend" },
        ],
      });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a missing name", async () => {
    const { name, ...payload } = validPayload;
    const res = await request(app).post("/api/applications").set("Authorization", authHeader).send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects an invalid repository URL", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ ...validPayload, repositoryUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("never returns internal fields like tenantId or ownerId", async () => {
    const res = await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);
    expect(res.body.tenantId).toBeUndefined();
    expect(res.body.ownerId).toBeUndefined();
  });

  it("accepts a private repository given its access token, but never echoes the token back", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ ...validPayload, isPrivate: true, accessToken: "glpat-super-secret" });

    expect(res.status).toBe(201);
    expect(res.body.repositories[0].isPrivate).toBe(true);
    expect(res.body.repositories[0].accessToken).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain("glpat-super-secret");
  });

  it("rejects a repository marked private with no access token", async () => {
    const res = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ ...validPayload, isPrivate: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toMatch(/access token/i);
  });

  it("rejects the request when not authenticated", async () => {
    const res = await request(app).post("/api/applications").send(validPayload);
    expect(res.status).toBe(401);
  });
});

describe("GET /api/applications", () => {
  it("lists created applications, newest first", async () => {
    await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);
    await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ ...validPayload, name: "Second App", aaNumber: "AA-99" });

    const res = await request(app).get("/api/applications").set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0].name).toBe("Second App");
  });

  it("returns an empty array when nothing has been created", async () => {
    const res = await request(app).get("/api/applications").set("Authorization", authHeader);
    expect(res.body).toEqual([]);
  });

  it("never lists another user's applications", async () => {
    await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);
    const other = await registerTestUser(app);

    const res = await request(app).get("/api/applications").set("Authorization", other.authHeader);
    expect(res.body).toEqual([]);
  });
});

describe("GET /api/applications/:id", () => {
  it("returns a 404 for an unknown id", async () => {
    const res = await request(app).get("/api/applications/app_does-not-exist").set("Authorization", authHeader);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("APPLICATION_NOT_FOUND");
  });

  it("returns the created application by id", async () => {
    const created = await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);
    const res = await request(app).get(`/api/applications/${created.body.id}`).set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
  });

  it("404s for another user's application (never leaks its existence)", async () => {
    const created = await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);
    const other = await registerTestUser(app);

    const res = await request(app).get(`/api/applications/${created.body.id}`).set("Authorization", other.authHeader);
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/applications/:id", () => {
  it("deletes an application and 404s afterwards", async () => {
    const created = await request(app).post("/api/applications").set("Authorization", authHeader).send(validPayload);

    const del = await request(app).delete(`/api/applications/${created.body.id}`).set("Authorization", authHeader);
    expect(del.status).toBe(204);

    const after = await request(app).get(`/api/applications/${created.body.id}`).set("Authorization", authHeader);
    expect(after.status).toBe(404);
  });
});
