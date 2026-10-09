import { rm } from "node:fs/promises";
import { join } from "node:path";

import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { jobRepository } from "../repositories/job.repository.js";
import { applicationService } from "./application.service.js";
import { gitlabService } from "./gitlab.service.js";

const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);
const POLL_INTERVAL_MS = 400;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mapApplicationStats(pythonStats = {}) {
  return {
    files: pythonStats.files ?? 0,
    parsedFiles: pythonStats.parsedFiles ?? 0,
    languages: pythonStats.languages ?? {},
    classes: pythonStats.classes ?? 0,
    functions: pythonStats.functions ?? 0,
    symbols: pythonStats.symbols ?? 0,
    relationships: pythonStats.relationships ?? 0,
    chunks: pythonStats.chunks ?? 0,
    // Python reports this as vector_store.count(repository_id) - the same
    // number as chunks, since this schema stores one embedding per chunk
    // rather than in a separate table. It was being silently dropped here,
    // which is why the UI always showed "Embeddings: 0" regardless of how
    // many were actually generated.
    embeddings: pythonStats.embeddings ?? 0,
  };
}

/**
 * Drives every one of an application's repositories through the full
 * indexing pipeline, one at a time: GitLab clone (Node-owned) -> Python
 * indexing (delegated, polled, and relayed back into this same Job
 * record so the frontend sees one continuous progress bar regardless of
 * how many repositories or which process is doing the work). Each
 * repository is indexed under its own repo_key into the *same* Python
 * graph (repository_id = application id) - see IndexingService on the
 * Python side for how that keeps multi-repo cross-references (like a
 * frontend repo's CALLS_API edges into a backend repo) working.
 */
export class IndexingService {
  constructor({
    applicationSvc = applicationService,
    jobRepo = jobRepository,
    gitlabSvc = gitlabService,
    ciClient = codeIntelligenceClient,
  } = {}) {
    this.applicationService = applicationSvc;
    this.jobRepository = jobRepo;
    this.gitlabService = gitlabSvc;
    this.codeIntelligenceClient = ciClient;
  }

  async startIndexing(applicationId, user) {
    const app = await this.applicationService.getInternal(applicationId, user);

    const job = this.jobRepository.create(applicationId);
    await this.applicationService.update(applicationId, user, { status: "QUEUED", activeJobId: job.id });

    this._runIndexing(job.id, app, user).catch(async (err) => {
      this.jobRepository.update(job.id, {
        status: "FAILED",
        error: err.message ?? "Indexing failed.",
        completedAt: new Date().toISOString(),
      });
      await this.applicationService.update(applicationId, user, { status: "FAILED", activeJobId: null });
    });

    return job;
  }

  async cancelIndexing(jobId, user) {
    const job = this.jobRepository.findById(jobId);
    if (!job) {
      throw new AppError(404, "JOB_NOT_FOUND", `No job found with id ${jobId}.`);
    }
    // Ownership check: the job's application must belong to this tenant.
    await this.applicationService.get(job.applicationId, user);

    if (TERMINAL_STATUSES.has(job.status)) return job;

    this.jobRepository.update(jobId, { cancelRequested: true });
    if (job.pythonJobId) {
      await this.codeIntelligenceClient.cancelIndex(job.pythonJobId);
    }
    return this.jobRepository.findById(jobId);
  }

  async _runIndexing(jobId, app, user) {
    const repos = app.repositories;
    const totalRepos = repos.length;
    const commits = {};
    let finalStats = app.stats;

    await this.applicationService.update(app.id, user, { status: "PROCESSING" });

    for (let index = 0; index < totalRepos; index++) {
      const repo = repos[index];
      const label = totalRepos > 1 ? `[${repo.name}] ` : "";
      const baseProgress = Math.round((index / totalRepos) * 90);

      this._log(jobId, "CLONING", Math.max(5, baseProgress) + 5, `${label}Connecting to repository`);

      const destPath = join(env.workspaceRoot, app.id, repo.repoKey);
      await rm(destPath, { recursive: true, force: true });
      const { commitSha } = await this.gitlabService.prepareRepository(
        repo.repositoryUrl,
        repo.branch,
        destPath,
        repo.accessToken ?? undefined,
      );
      commits[repo.repoKey] = commitSha;

      this._log(jobId, "CLONING", Math.max(10, baseProgress) + 5, `${label}Repository cloned`, {
        commitHash: commitSha,
      });

      const { jobId: pythonJobId } = await this.codeIntelligenceClient.indexRepository({
        repositoryId: app.id,
        repositoryPath: destPath,
        commitHash: commitSha,
        repoKey: repo.repoKey,
      });
      this.jobRepository.update(jobId, { pythonJobId });

      const outcome = await this._pollPythonJob(jobId, pythonJobId, { index, totalRepos, label });

      if (outcome.status === "FAILED") {
        await this.applicationService.update(app.id, user, { status: "FAILED", activeJobId: null });
        this.jobRepository.update(jobId, {
          status: "FAILED",
          error: outcome.error ?? `${label}Indexing failed.`,
          completedAt: new Date().toISOString(),
        });
        return;
      }

      if (outcome.status === "CANCELLED") {
        await this.applicationService.update(app.id, user, { status: app.lastIndexedAt ? "READY" : "NEW", activeJobId: null });
        this.jobRepository.update(jobId, { status: "CANCELLED", completedAt: new Date().toISOString() });
        return;
      }

      finalStats = outcome.stats;
    }

    await this.applicationService.update(app.id, user, {
      status: "READY",
      lastIndexedAt: new Date().toISOString(),
      lastIndexedCommits: commits,
      stats: finalStats,
      activeJobId: null,
    });
    this.jobRepository.update(jobId, {
      status: "COMPLETED",
      progress: 100,
      stats: finalStats,
      completedAt: new Date().toISOString(),
    });
  }

  /** Polls one repository's Python job to a terminal state, relaying its
   * progress into the overall job's [index/totalRepos, (index+1)/totalRepos]
   * slice of the 10-100 progress range (0-10 is reserved for the initial
   * clone of the first repo). */
  async _pollPythonJob(jobId, pythonJobId, { index, totalRepos, label }) {
    const repoShare = 90 / totalRepos;
    for (;;) {
      const pythonStatus = await this.codeIntelligenceClient.getIndexStatus(pythonJobId);
      const withinRepo = pythonStatus.status === "COMPLETED" ? repoShare : (pythonStatus.progress / 100) * repoShare;
      const overallProgress = Math.min(99, Math.round(10 + index * repoShare + withinRepo));
      const isLastRepoCompletion = pythonStatus.status === "COMPLETED" && index === totalRepos - 1;

      this.jobRepository.update(jobId, {
        status: isLastRepoCompletion || pythonStatus.status !== "COMPLETED" ? pythonStatus.status : "PROCESSING",
        progress: isLastRepoCompletion ? 100 : overallProgress,
        message: `${label}${pythonStatus.message}`,
        stats: mapApplicationStats(pythonStatus.stats),
        logs: (pythonStatus.logs ?? []).map((l) => ({ timestamp: l.timestamp, message: `${label}${l.message}` })),
      });

      if (TERMINAL_STATUSES.has(pythonStatus.status)) {
        return { status: pythonStatus.status, stats: mapApplicationStats(pythonStatus.stats), error: pythonStatus.error };
      }
      await sleep(POLL_INTERVAL_MS);
    }
  }

  _log(jobId, status, progress, message, extra = {}) {
    const job = this.jobRepository.findById(jobId);
    const logs = [...(job?.logs ?? []), { timestamp: Date.now() / 1000, message }];
    this.jobRepository.update(jobId, { status, progress, message, logs, ...extra });
  }
}

export const indexingService = new IndexingService();
