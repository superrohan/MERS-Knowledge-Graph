import { randomUUID } from "node:crypto";

/**
 * Node's own ProcessingJob (spec §14). Its status enum starts with two
 * stages Node owns itself (QUEUED, CLONING - GitLab validation/clone
 * happens here) and then mirrors whatever stage the Python indexing job
 * reports (SCANNING..FINALIZING/COMPLETED/FAILED/CANCELLED), so the
 * frontend never needs to know indexing spans two processes.
 */
export function createJobRecord(applicationId) {
  const now = new Date().toISOString();
  return {
    id: `job_${randomUUID()}`,
    applicationId,
    status: "QUEUED",
    progress: 0,
    message: "Queued",
    stats: { files: 0, parsedFiles: 0, languages: {}, symbols: 0, relationships: 0, chunks: 0, embeddings: 0 },
    logs: [{ timestamp: Date.now() / 1000, message: "Queued" }],
    startedAt: now,
    completedAt: null,
    error: null,
    commitHash: null,
    pythonJobId: null,
    cancelRequested: false,
  };
}

export function toPublicJob(job) {
  return {
    id: job.id,
    applicationId: job.applicationId,
    status: job.status,
    progress: job.progress,
    message: job.message,
    stats: job.stats,
    logs: job.logs,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
    error: job.error,
    commitHash: job.commitHash,
  };
}
