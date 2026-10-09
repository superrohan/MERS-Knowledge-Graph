import { Router } from "express";

import { knowledgeBaseService } from "../../services/knowledgeBase.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const knowledgeBaseRouter = Router({ mergeParams: true });

knowledgeBaseRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await knowledgeBaseService.getOverview(req.params.id, req.user));
  }),
);

knowledgeBaseRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    res.json(await knowledgeBaseService.getStats(req.params.id, req.user));
  }),
);

knowledgeBaseRouter.get(
  "/graph",
  asyncHandler(async (req, res) => {
    const { search, nodeTypes, relationshipTypes, limit } = req.query;
    res.json(await knowledgeBaseService.getGraph(req.params.id, req.user, { search, nodeTypes, relationshipTypes, limit }));
  }),
);
