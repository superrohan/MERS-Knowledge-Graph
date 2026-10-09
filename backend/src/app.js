import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";

import { applicationsRouter } from "./api/applications/applications.routes.js";
import { authRouter } from "./api/auth/auth.routes.js";
import { gitlabRouter } from "./api/gitlab/gitlab.routes.js";
import { authenticate } from "./middleware/auth.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { requestId } from "./middleware/requestId.js";

/**
 * Builds the Express application without starting a listener, so it can be
 * exercised directly in tests via supertest.
 */
export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(requestId);
  app.use(
    morgan(":method :url :status :response-time ms - :res[content-length]", {
      // /health is just noise; the job-events stream carries its session
      // token as a query param (EventSource can't set a header - see
      // middleware/auth.js) and must never be written to a log line.
      skip: (req) => req.path === "/health" || req.path.endsWith("/events"),
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "backend", timestamp: new Date().toISOString() });
  });

  // Registration/login themselves are the only endpoints reachable
  // without a session.
  app.use("/api/auth", authRouter);

  app.use(authenticate);

  app.use("/api/applications", applicationsRouter);
  app.use("/api/gitlab", gitlabRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
