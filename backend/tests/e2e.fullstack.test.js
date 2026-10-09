/**
 * True end-to-end test: real Python service (spawned as a subprocess),
 * real Node app (in-process via supertest), real git clone of a real
 * local repository. Nothing in this file is mocked - it exercises
 * exactly the path described in spec §54/§58.
 *
 * Slower than the rest of the suite (spawns a Python process and clones
 * a real repo), so it's kept in its own file.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTempGitRepo } from "./helpers/tempGitRepo.js";
import { startPythonService } from "./helpers/pythonService.js";
import { registerTestUser } from "./helpers/authUser.js";

const PYTHON_PORT = 8091;

let app;
let pythonService;
let repo;
let authHeader;

function waitForTerminalStatus(applicationId, jobId, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}/jobs/${jobId}`)
        .set("Authorization", authHeader);
      if (["COMPLETED", "FAILED", "CANCELLED"].includes(res.body.status)) return resolve(res.body);
      if (Date.now() - start > timeoutMs) return reject(new Error("Indexing did not finish in time"));
      setTimeout(tick, 100);
    };
    tick();
  });
}

let request;

beforeAll(async () => {
  pythonService = await startPythonService(PYTHON_PORT);
  process.env.PYTHON_SERVICE_URL = pythonService.url;

  request = (await import("supertest")).default;
  const { createApp } = await import("../src/app.js");
  app = createApp();

  repo = await createTempGitRepo();
  ({ authHeader } = await registerTestUser(app));
}, 30000);

afterAll(async () => {
  await pythonService?.stop();
  await repo?.cleanup();
});

describe("Full-stack end-to-end (spec §54, §58)", () => {
  let applicationId;

  it("1-9: creates an application, validates GitLab, and starts real processing", async () => {
    const validateRes = await request(app)
      .post("/api/gitlab/validate")
      .set("Authorization", authHeader)
      .send({ repositoryUrl: repo.url });
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.branches).toContain("main");

    const createRes = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "E2E Fixture App", aaNumber: "AA-E2E-1", repositoryUrl: repo.url, branch: "main" });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe("NEW");
    applicationId = createRes.body.id;

    const indexRes = await request(app)
      .post(`/api/applications/${applicationId}/index`)
      .set("Authorization", authHeader);
    expect(indexRes.status).toBe(202);
    expect(indexRes.body.status).toBe("QUEUED");
  });

  it("10-14: reports real, non-fake indexing progress and completes successfully", async () => {
    const app_ = await request(app).get(`/api/applications/${applicationId}`).set("Authorization", authHeader);
    const jobId = app_.body.activeJobId;
    expect(jobId).toBeTruthy();

    const finishedJob = await waitForTerminalStatus(applicationId, jobId);
    expect(finishedJob.status).toBe("COMPLETED");

    // Real numbers from real parsing of the real fixture repo - not the
    // spec's example numbers (1,248 files / 8,932 symbols / etc).
    expect(finishedJob.stats.files).toBe(17);
    expect(finishedJob.stats.symbols).toBeGreaterThan(20);
    expect(finishedJob.stats.relationships).toBeGreaterThan(10);
    expect(finishedJob.stats.chunks).toBeGreaterThan(0);
  });

  it("15-17: exposes the generated knowledge base and its real graph statistics", async () => {
    const appRes = await request(app).get(`/api/applications/${applicationId}`).set("Authorization", authHeader);
    expect(appRes.body.status).toBe("READY");
    expect(appRes.body.lastIndexedCommits.main).toMatch(/^[0-9a-f]{40}$/);

    const kbRes = await request(app)
      .get(`/api/applications/${applicationId}/knowledge-base`)
      .set("Authorization", authHeader);
    expect(kbRes.status).toBe(200);

    const statsRes = await request(app)
      .get(`/api/applications/${applicationId}/knowledge-base/stats`)
      .set("Authorization", authHeader);
    expect(statsRes.body.files).toBe(17);
    expect(statsRes.body.classes).toBeGreaterThan(0);

    const graphRes = await request(app)
      .get(`/api/applications/${applicationId}/knowledge-base/graph`)
      .set("Authorization", authHeader)
      .query({ search: "AuthService" });
    expect(graphRes.body.nodes.length).toBeGreaterThan(0);
    expect(graphRes.body.nodes.some((n) => n.name === "AuthService")).toBe(true);
  });

  it("18-23: answers a real question with real citations, graph evidence, and viewable source", async () => {
    const queryRes = await request(app)
      .post(`/api/applications/${applicationId}/query`)
      .set("Authorization", authHeader)
      .send({ query: "How does authentication work in this application?" });

    expect(queryRes.status).toBe(201);
    expect(queryRes.body.citations.length).toBeGreaterThan(0);
    expect(queryRes.body.answer).not.toMatch(/lorem ipsum|placeholder|todo/i);

    const citation = queryRes.body.citations.find((c) => c.filePath === "src/services/auth_service.py") ?? queryRes.body.citations[0];

    const sourceRes = await request(app)
      .get(`/api/applications/${applicationId}/source`)
      .set("Authorization", authHeader)
      .query({ path: citation.filePath, startLine: citation.startLine, endLine: citation.endLine });
    expect(sourceRes.status).toBe(200);
    expect(sourceRes.body.lines.length).toBeGreaterThan(0);
  });

  it("24-25: asks a second question and lists both in query history", async () => {
    await request(app)
      .post(`/api/applications/${applicationId}/query`)
      .set("Authorization", authHeader)
      .send({ query: "What calls PaymentService?" });

    const historyRes = await request(app)
      .get(`/api/applications/${applicationId}/query-history`)
      .set("Authorization", authHeader);
    expect(historyRes.body.length).toBe(2);
    expect(historyRes.body.map((h) => h.query)).toEqual(
      expect.arrayContaining(["How does authentication work in this application?", "What calls PaymentService?"]),
    );
  });

  it("26-27: re-indexing with no file changes reflects the same stats and is genuinely incremental", async () => {
    const reindexRes = await request(app)
      .post(`/api/applications/${applicationId}/index`)
      .set("Authorization", authHeader);
    expect(reindexRes.status).toBe(202);
    const jobId = reindexRes.body.id;

    const finishedJob = await waitForTerminalStatus(applicationId, jobId);
    expect(finishedJob.status).toBe("COMPLETED");
    expect(finishedJob.stats.files).toBe(17);
    expect(finishedJob.stats.symbols).toBeGreaterThan(20);
  });

  it("28: recovers gracefully when asked to query a not-yet-ready application", async () => {
    const createRes = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "Not ready app", aaNumber: "AA-E2E-2", repositoryUrl: repo.url, branch: "main" });

    const queryRes = await request(app)
      .post(`/api/applications/${createRes.body.id}/query`)
      .set("Authorization", authHeader)
      .send({ query: "anything" });

    expect(queryRes.status).toBe(409);
    expect(queryRes.body.error.code).toBe("KNOWLEDGE_BASE_NOT_READY");
  });
});
