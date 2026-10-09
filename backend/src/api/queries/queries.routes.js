import { Router } from "express";

import { queryService } from "../../services/query.service.js";
import { sourceService } from "../../services/source.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";

export const queriesRouter = Router({ mergeParams: true });

queriesRouter.post(
  "/query",
  asyncHandler(async (req, res) => {
    const result = await queryService.query(req.params.id, req.user, req.body?.query);
    res.status(201).json(result);
  }),
);

queriesRouter.get(
  "/query-history",
  asyncHandler(async (req, res) => {
    res.json(await queryService.getHistory(req.params.id, req.user));
  }),
);

queriesRouter.get(
  "/query-history/:queryId",
  asyncHandler(async (req, res) => {
    res.json(await queryService.getHistoryItem(req.params.id, req.params.queryId, req.user));
  }),
);

queriesRouter.get(
  "/source",
  asyncHandler(async (req, res) => {
    const { path, startLine, endLine } = req.query;
    res.json(await sourceService.getSource(req.params.id, req.user, { path, startLine, endLine }));
  }),
);
