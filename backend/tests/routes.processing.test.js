import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/clients/code-intelligence.client.js", () => ({
  codeIntelligenceClient: {
    indexRepository: vi.fn().mockResolvedValue({ jobId: "py_job_route_test", status: "SCANNING" }),
    getIndexStatus: vi.fn().mockResolvedValue({
      status: "COMPLETED",
      progress: 100,
      message: "Done",
      stats: { files: 17, symbols: 40, relationships: 15, chunks: 30 },
      logs: [{ timestamp: 1, message: "Done" }],
    }),
    cancelIndex: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({
      queryId: "query_route_test",
      query: "How does authentication work?",
      queryType: "hybrid",
      answer: "AuthService (src/services/auth_service.py:31-72) handles it.",
      basis: "FACT",
      citations: [{ filePath: "src/services/auth_service.py", startLine: 31, endLine: 72, symbolId: "s1" }],
      graphPath: [{ source: "LoginController.login", relationship: "CALLS", target: "AuthService.authenticate" }],
      metadata: { filesRetrieved: 1, symbolsRetrieved: 1, graphNodesRetrieved: 2 },
    }),
    getRepositoryStats: vi.fn().mockResolvedValue({ files: 17, classes: 6, functions: 20, symbols: 40, relationships: 15, chunks: 30 }),
    getGraph: vi.fn().mockResolvedValue({ nodes: [], edges: [] }),
    getSource: vi.fn().mockResolvedValue({ filePath: "src/services/auth_service.py", startLine: 31, endLine: 72, totalLines: 100, lines: ["def authenticate(self):"] }),
  },
}));

import { createApp } from "../src/app.js";
import { applicationRepository } from "../src/repositories/application.repository.js";
import { createTempGitRepo } from "./helpers/tempGitRepo.js";
import { registerTestUser } from "./helpers/authUser.js";

const app = createApp();

function waitForStatus(applicationId, jobId, status, authHeader, timeoutMs = 3000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = async () => {
      const res = await request(app)
        .get(`/api/applications/${applicationId}/jobs/${jobId}`)
        .set("Authorization", authHeader);
      if (res.body.status === status) return resolve(res.body);
      if (Date.now() - start > timeoutMs) return reject(new Error(`Timed out waiting for ${status}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

describe("Processing routes (index -> jobs -> knowledge-base -> query -> source)", () => {
  let repo;
  let applicationId;
  let authHeader;
  let token;

  beforeEach(async () => {
    await applicationRepository.clear();
    ({ authHeader, token } = await registerTestUser(app));
    repo = await createTempGitRepo();
    const created = await request(app)
      .post("/api/applications")
      .set("Authorization", authHeader)
      .send({ name: "Fixture App", aaNumber: "AA-1", repositoryUrl: repo.url, branch: "main" });
    applicationId = created.body.id;
  });

  afterEach(() => repo.cleanup());

  it("runs the full processing -> knowledge base -> query -> source flow", async () => {
    const indexRes = await request(app).post(`/api/applications/${applicationId}/index`).set("Authorization", authHeader);
    expect(indexRes.status).toBe(202);
    const jobId = indexRes.body.id;

    const finishedJob = await waitForStatus(applicationId, jobId, "COMPLETED", authHeader);
    expect(finishedJob.stats.symbols).toBe(40);

    const appRes = await request(app).get(`/api/applications/${applicationId}`).set("Authorization", authHeader);
    expect(appRes.body.status).toBe("READY");
    expect(appRes.body.stats.symbols).toBe(40);

    const kbRes = await request(app)
      .get(`/api/applications/${applicationId}/knowledge-base/stats`)
      .set("Authorization", authHeader);
    expect(kbRes.status).toBe(200);
    expect(kbRes.body.classes).toBe(6);

    const queryRes = await request(app)
      .post(`/api/applications/${applicationId}/query`)
      .set("Authorization", authHeader)
      .send({ query: "How does authentication work?" });
    expect(queryRes.status).toBe(201);
    expect(queryRes.body.citations).toHaveLength(1);

    const historyRes = await request(app)
      .get(`/api/applications/${applicationId}/query-history`)
      .set("Authorization", authHeader);
    expect(historyRes.body).toHaveLength(1);

    const historyItemRes = await request(app)
      .get(`/api/applications/${applicationId}/query-history/${queryRes.body.queryId}`)
      .set("Authorization", authHeader);
    expect(historyItemRes.status).toBe(200);
    expect(historyItemRes.body.graphPath).toHaveLength(1);

    const sourceRes = await request(app)
      .get(`/api/applications/${applicationId}/source`)
      .set("Authorization", authHeader)
      .query({ path: "src/services/auth_service.py", startLine: 31, endLine: 72 });
    expect(sourceRes.status).toBe(200);
    expect(sourceRes.body.lines).toContain("def authenticate(self):");
  });

  it("rejects querying before the knowledge base is READY", async () => {
    const res = await request(app)
      .post(`/api/applications/${applicationId}/query`)
      .set("Authorization", authHeader)
      .send({ query: "anything" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("KNOWLEDGE_BASE_NOT_READY");
  });

  it("rejects any of these routes for an unauthenticated caller", async () => {
    const res = await request(app).get(`/api/applications/${applicationId}`);
    expect(res.status).toBe(401);
  });

  it("streams job progress over SSE and closes when the job completes", async () => {
    const indexRes = await request(app).post(`/api/applications/${applicationId}/index`).set("Authorization", authHeader);
    const jobId = indexRes.body.id;

    // A real browser's EventSource can't set an Authorization header, so
    // this route accepts the same session token as a query param instead
    // (see middleware/auth.js) - exercise that exact path here, not the
    // header, since header auth is already covered by every other test.
    const events = await new Promise((resolve, reject) => {
      const chunks = [];
      const req = request(app)
        .get(`/api/applications/${applicationId}/jobs/${jobId}/events`)
        .query({ token })
        .buffer(true)
        .parse((res, callback) => {
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () => callback(null, Buffer.concat(chunks).toString("utf8")));
        })
        .end((err, res) => {
          if (err) return reject(err);
          resolve(res.body);
        });
      setTimeout(() => req.abort?.(), 5000);
    });

    expect(events).toContain("data:");
    expect(events).toContain("COMPLETED");
  });

  it("returns 404 for a job that does not belong to the application", async () => {
    const res = await request(app)
      .get(`/api/applications/${applicationId}/jobs/job_does-not-exist`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(404);
  });
});
