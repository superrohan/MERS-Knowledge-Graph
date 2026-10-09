import { Router } from "express";

import { AppError } from "../../middleware/errorHandler.js";
import { toPublicJob } from "../../models/job.js";
import { jobRepository } from "../../repositories/job.repository.js";
import { applicationService } from "../../services/application.service.js";
import { indexingService } from "../../services/indexing.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const jobsRouter = Router({ mergeParams: true });

async function getOwnedJob(applicationId, jobId, user) {
  await applicationService.get(applicationId, user); // 404s if not found/not owned
  const job = jobRepository.findById(jobId);
  if (!job || job.applicationId !== applicationId) {
    throw new AppError(404, "JOB_NOT_FOUND", `No job found with id ${jobId}.`);
  }
  return job;
}

jobsRouter.post(
  "/index",
  asyncHandler(async (req, res) => {
    const job = await indexingService.startIndexing(req.params.id, req.user);
    res.status(202).json(toPublicJob(job));
  }),
);

jobsRouter.get(
  "/jobs/:jobId",
  asyncHandler(async (req, res) => {
    const job = await getOwnedJob(req.params.id, req.params.jobId, req.user);
    res.json(toPublicJob(job));
  }),
);

jobsRouter.post(
  "/jobs/:jobId/cancel",
  asyncHandler(async (req, res) => {
    await getOwnedJob(req.params.id, req.params.jobId, req.user);
    const job = await indexingService.cancelIndexing(req.params.jobId, req.user);
    res.json(toPublicJob(job));
  }),
);

const SSE_POLL_INTERVAL_MS = 500;
const TERMINAL_STATUSES = new Set(["COMPLETED", "FAILED", "CANCELLED"]);

jobsRouter.get("/jobs/:jobId/events", async (req, res) => {
  let job;
  try {
    job = await getOwnedJob(req.params.id, req.params.jobId, req.user);
  } catch (err) {
    res.status(err.status ?? 500).json({ error: { code: err.code ?? "INTERNAL_ERROR", message: err.message } });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  let lastPayload = null;
  const send = (currentJob) => {
    const payload = JSON.stringify({
      status: currentJob.status,
      progress: currentJob.progress,
      message: currentJob.message,
      stats: currentJob.stats,
    });
    if (payload === lastPayload) return;
    lastPayload = payload;
    res.write(`data: ${payload}\n\n`);
  };

  send(job);

  const interval = setInterval(() => {
    const current = jobRepository.findById(req.params.jobId);
    if (!current) {
      clearInterval(interval);
      res.end();
      return;
    }
    send(current);
    if (TERMINAL_STATUSES.has(current.status)) {
      clearInterval(interval);
      res.end();
    }
  }, SSE_POLL_INTERVAL_MS);

  req.on("close", () => clearInterval(interval));
});
