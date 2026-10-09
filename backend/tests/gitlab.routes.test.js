import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { createApp } from "../src/app.js";
import request from "supertest";
import { createTempGitRepo } from "./helpers/tempGitRepo.js";
import { registerTestUser } from "./helpers/authUser.js";

const app = createApp();
let authHeader;

beforeAll(async () => {
  ({ authHeader } = await registerTestUser(app));
});

describe("POST /api/gitlab/validate", () => {
  let repo;

  beforeEach(async () => {
    repo = await createTempGitRepo();
  });

  afterEach(() => repo.cleanup());

  it("returns repository info and branches for a valid repository", async () => {
    const res = await request(app)
      .post("/api/gitlab/validate")
      .set("Authorization", authHeader)
      .send({ repositoryUrl: repo.url });
    expect(res.status).toBe(200);
    expect(res.body.defaultBranch).toBe("main");
    expect(res.body.branches).toContain("main");
  });

  it("returns 400 for a malformed URL", async () => {
    const res = await request(app)
      .post("/api/gitlab/validate")
      .set("Authorization", authHeader)
      .send({ repositoryUrl: "not-a-url" });
    expect(res.status).toBe(400);
  });

  it("returns 404 for a repository that does not exist", async () => {
    const res = await request(app)
      .post("/api/gitlab/validate")
      .set("Authorization", authHeader)
      .send({ repositoryUrl: `${repo.url}-missing` });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("GITLAB_REPOSITORY_NOT_FOUND");
  });

  it("rejects the request when not authenticated", async () => {
    const res = await request(app).post("/api/gitlab/validate").send({ repositoryUrl: repo.url });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/gitlab/branches", () => {
  let repo;

  beforeEach(async () => {
    repo = await createTempGitRepo();
  });

  afterEach(() => repo.cleanup());

  it("lists branches for a valid repository", async () => {
    const res = await request(app)
      .get("/api/gitlab/branches")
      .set("Authorization", authHeader)
      .query({ repositoryUrl: repo.url });
    expect(res.status).toBe(200);
    expect(res.body.map((b) => b.name)).toContain("main");
  });
});
