import { Router } from "express";

import { authorizationService } from "../../services/authorization.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const authorizationRouter = Router({ mergeParams: true });

// GET /api/applications/:id/authorizations - see
// services/authorization.service.js for the full picture: this returns
// dummy data for now (the real AA Authorization Registry isn't
// reachable yet), in the exact shape the real integration will return.
authorizationRouter.get(
  "/authorizations",
  asyncHandler(async (req, res) => {
    res.json(await authorizationService.getAuthorizations(req.params.id, req.user));
  }),
);
