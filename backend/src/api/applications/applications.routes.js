import { Router } from "express";

import { applicationService } from "../../services/application.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { apiAnnotationsRouter } from "../api-annotations/api-annotations.routes.js";
import { authorizationRouter } from "../authorization/authorization.routes.js";
import { jobsRouter } from "../jobs/jobs.routes.js";
import { knowledgeBaseRouter } from "../knowledge-base/knowledge-base.routes.js";
import { queriesRouter } from "../queries/queries.routes.js";

export const applicationsRouter = Router();

applicationsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const app = await applicationService.create(req.body ?? {}, req.user);
    res.status(201).json(app);
  }),
);

applicationsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await applicationService.list(req.user));
  }),
);

applicationsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await applicationService.get(req.params.id, req.user));
  }),
);

applicationsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    await applicationService.delete(req.params.id, req.user);
    res.status(204).send();
  }),
);

applicationsRouter.use("/:id", jobsRouter);
applicationsRouter.use("/:id/knowledge-base", knowledgeBaseRouter);
applicationsRouter.use("/:id", queriesRouter);
applicationsRouter.use("/:id", apiAnnotationsRouter);
applicationsRouter.use("/:id", authorizationRouter);
