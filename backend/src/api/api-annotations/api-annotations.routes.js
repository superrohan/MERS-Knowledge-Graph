import { Router } from "express";

import { apiAnnotationsService } from "../../services/apiAnnotations.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const apiAnnotationsRouter = Router({ mergeParams: true });

apiAnnotationsRouter.get(
  "/api-annotations",
  asyncHandler(async (req, res) => {
    res.json(await apiAnnotationsService.list(req.params.id, req.user));
  }),
);

apiAnnotationsRouter.post(
  "/api-annotations",
  asyncHandler(async (req, res) => {
    res.status(201).json(await apiAnnotationsService.create(req.params.id, req.user, req.body ?? {}));
  }),
);

apiAnnotationsRouter.put(
  "/api-annotations/:annotationId",
  asyncHandler(async (req, res) => {
    res.json(await apiAnnotationsService.update(req.params.id, req.params.annotationId, req.user, req.body ?? {}));
  }),
);

apiAnnotationsRouter.delete(
  "/api-annotations/:annotationId",
  asyncHandler(async (req, res) => {
    await apiAnnotationsService.delete(req.params.id, req.params.annotationId, req.user);
    res.status(204).send();
  }),
);

apiAnnotationsRouter.post(
  "/api-annotations/:annotationId/verify",
  asyncHandler(async (req, res) => {
    res.json(await apiAnnotationsService.verify(req.params.id, req.params.annotationId, req.user));
  }),
);
