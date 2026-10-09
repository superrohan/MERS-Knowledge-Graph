import { Router } from "express";

import { gitlabService } from "../../services/gitlab.service.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { requireString } from "../../utils/validation.js";

export const gitlabRouter = Router();

function cleanToken(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

gitlabRouter.post(
  "/validate",
  asyncHandler(async (req, res) => {
    const repositoryUrl = requireString(req.body?.repositoryUrl, "repositoryUrl");
    // Sent in the POST body, not a query string, so it never lands in
    // access logs the way a query parameter would.
    const accessToken = cleanToken(req.body?.accessToken);
    const result = await gitlabService.validateRepository(repositoryUrl, accessToken);
    res.json(result);
  }),
);

gitlabRouter.get(
  "/branches",
  asyncHandler(async (req, res) => {
    const repositoryUrl = requireString(req.query.repositoryUrl, "repositoryUrl");
    // A header, not a query parameter, for the same reason as above -
    // this is a GET endpoint, and its URL (including any query string)
    // is what the access-log middleware records.
    const accessToken = cleanToken(req.get("X-GitLab-Access-Token"));
    const branches = await gitlabService.listBranches(repositoryUrl, accessToken);
    res.json(branches);
  }),
);
