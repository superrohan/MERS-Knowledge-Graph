import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationRepository } from "../src/repositories/application.repository.js";
import { applicationService } from "../src/services/application.service.js";
import { IndexingService } from "../src/services/indexing.service.js";
import { jobRepository } from "../src/repositories/job.repository.js";

const user = { id: "dev-user", tenantId: "dev-tenant" };

function waitFor(predicate, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      if (await predicate()) return resolve();
      if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timed out"));
      setTimeout(tick, 10);
    };
    tick();
  });
}

describe("IndexingService", () => {
  let app;

  beforeEach(async () => {
    await applicationRepository.clear();
    app = await applicationService.create(
      { name: "Fixture App", aaNumber: "AA-1", repositoryUrl: "https://gitlab.com/team/fixture", branch: "main" },
      user,
    );
  });

  it("drives a job from QUEUED through Python-reported stages to READY", async () => {
    const pythonStages = [
      { status: "SCANNING", progress: 10, message: "Scanning", stats: { files: 5 } },
      { status: "PARSING", progress: 50, message: "Parsing", stats: { files: 5, symbols: 20 } },
      { status: "COMPLETED", progress: 100, message: "Done", stats: { files: 5, symbols: 20, relationships: 8, chunks: 12 } },
    ];
    let call = 0;

    const gitlabService = { prepareRepository: vi.fn().mockResolvedValue({ commitSha: "abc123def" }) };
    const codeIntelligenceClient = {
      indexRepository: vi.fn().mockResolvedValue({ jobId: "py_job_1", status: "SCANNING" }),
      getIndexStatus: vi.fn().mockImplementation(() => Promise.resolve(pythonStages[call++] ?? pythonStages.at(-1))),
    };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(app.id, user);

    expect(job.status).toBe("QUEUED");

    await waitFor(() => jobRepository.findById(job.id).status === "COMPLETED");

    const finishedApp = await applicationService.get(app.id, user);
    expect(finishedApp.status).toBe("READY");
    expect(finishedApp.lastIndexedCommits).toEqual({ main: "abc123def" });
    expect(finishedApp.stats.symbols).toBe(20);
    expect(gitlabService.prepareRepository).toHaveBeenCalledWith(
      app.repositories[0].repositoryUrl,
      app.repositories[0].branch,
      expect.any(String),
      undefined,
    );
  });

  it("marks the application FAILED when Python reports a failure", async () => {
    const gitlabService = { prepareRepository: vi.fn().mockResolvedValue({ commitSha: "abc123" }) };
    const codeIntelligenceClient = {
      indexRepository: vi.fn().mockResolvedValue({ jobId: "py_job_2", status: "SCANNING" }),
      getIndexStatus: vi.fn().mockResolvedValue({ status: "FAILED", progress: 40, message: "boom", error: "Embedding provider unavailable", stats: {} }),
    };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(app.id, user);

    await waitFor(() => jobRepository.findById(job.id).status === "FAILED");

    expect((await applicationService.get(app.id, user)).status).toBe("FAILED");
    expect(jobRepository.findById(job.id).error).toBe("Embedding provider unavailable");
  });

  it("marks the application FAILED when GitLab cloning fails", async () => {
    const gitlabService = { prepareRepository: vi.fn().mockRejectedValue(new Error("clone failed")) };
    const codeIntelligenceClient = { indexRepository: vi.fn(), getIndexStatus: vi.fn() };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(app.id, user);

    await waitFor(async () => (await applicationService.get(app.id, user)).status === "FAILED");
    expect(codeIntelligenceClient.indexRepository).not.toHaveBeenCalled();
  });

  it("forwards cancellation to the Python job", async () => {
    const gitlabService = { prepareRepository: vi.fn().mockResolvedValue({ commitSha: "abc" }) };
    let resolveStatus;
    const codeIntelligenceClient = {
      indexRepository: vi.fn().mockResolvedValue({ jobId: "py_job_3", status: "SCANNING" }),
      getIndexStatus: vi.fn().mockImplementation(() => new Promise((resolve) => { resolveStatus = resolve; })),
      cancelIndex: vi.fn().mockResolvedValue(undefined),
    };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(app.id, user);

    await waitFor(() => jobRepository.findById(job.id).pythonJobId === "py_job_3");
    await indexingService.cancelIndexing(job.id, user);

    expect(codeIntelligenceClient.cancelIndex).toHaveBeenCalledWith("py_job_3");
    resolveStatus({ status: "CANCELLED", progress: 30, message: "Cancelled", stats: {} });

    await waitFor(() => jobRepository.findById(job.id).status === "CANCELLED");
  });

  it("indexes every repository of a multi-repo application into the same graph with distinct repo_keys", async () => {
    const multiApp = await applicationService.create(
      {
        name: "Multi Repo App",
        aaNumber: "AA-2",
        repositories: [
          { name: "Frontend", repositoryUrl: "https://gitlab.com/team/frontend" },
          { name: "Backend", repositoryUrl: "https://gitlab.com/team/backend" },
        ],
      },
      user,
    );

    const gitlabService = {
      prepareRepository: vi
        .fn()
        .mockResolvedValueOnce({ commitSha: "frontend-sha" })
        .mockResolvedValueOnce({ commitSha: "backend-sha" }),
    };
    const codeIntelligenceClient = {
      indexRepository: vi
        .fn()
        .mockResolvedValueOnce({ jobId: "py_job_frontend", status: "SCANNING" })
        .mockResolvedValueOnce({ jobId: "py_job_backend", status: "SCANNING" }),
      getIndexStatus: vi
        .fn()
        .mockResolvedValueOnce({ status: "COMPLETED", progress: 100, message: "Done", stats: { files: 3 } })
        .mockResolvedValueOnce({ status: "COMPLETED", progress: 100, message: "Done", stats: { files: 7 } }),
    };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(multiApp.id, user);

    await waitFor(() => jobRepository.findById(job.id).status === "COMPLETED");

    expect(gitlabService.prepareRepository).toHaveBeenNthCalledWith(
      1,
      "https://gitlab.com/team/frontend",
      "main",
      expect.stringContaining("frontend"),
      undefined,
    );
    expect(gitlabService.prepareRepository).toHaveBeenNthCalledWith(
      2,
      "https://gitlab.com/team/backend",
      "main",
      expect.stringContaining("backend"),
      undefined,
    );
    expect(codeIntelligenceClient.indexRepository).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ repositoryId: multiApp.id, repoKey: "frontend" }),
    );
    expect(codeIntelligenceClient.indexRepository).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ repositoryId: multiApp.id, repoKey: "backend" }),
    );

    const finishedApp = await applicationService.get(multiApp.id, user);
    expect(finishedApp.status).toBe("READY");
    expect(finishedApp.lastIndexedCommits).toEqual({ frontend: "frontend-sha", backend: "backend-sha" });
    expect(finishedApp.stats.files).toBe(7); // cumulative stats from the last repo indexed
  });

  it("forwards a private repository's own access token when cloning it", async () => {
    const privateApp = await applicationService.create(
      {
        name: "Private Repo App",
        aaNumber: "AA-3",
        repositoryUrl: "https://gitlab.com/team/secret-project",
        isPrivate: true,
        accessToken: "glpat-example-token",
      },
      user,
    );

    const gitlabService = { prepareRepository: vi.fn().mockResolvedValue({ commitSha: "abc999" }) };
    const codeIntelligenceClient = {
      indexRepository: vi.fn().mockResolvedValue({ jobId: "py_job_private", status: "SCANNING" }),
      getIndexStatus: vi
        .fn()
        .mockResolvedValue({ status: "COMPLETED", progress: 100, message: "Done", stats: { files: 1 } }),
    };

    const indexingService = new IndexingService({ gitlabSvc: gitlabService, ciClient: codeIntelligenceClient });
    const job = await indexingService.startIndexing(privateApp.id, user);

    await waitFor(() => jobRepository.findById(job.id).status === "COMPLETED");

    expect(gitlabService.prepareRepository).toHaveBeenCalledWith(
      "https://gitlab.com/team/secret-project",
      "main",
      expect.any(String),
      "glpat-example-token",
    );
  });
});
