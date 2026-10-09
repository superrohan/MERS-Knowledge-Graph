import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
import { AppError } from "../middleware/errorHandler.js";
import { applicationService } from "./application.service.js";
import { requireString } from "../utils/validation.js";

/**
 * Fronts the Python source endpoint. Path-traversal protection is
 * enforced in Python (the only process that actually knows the checkout
 * root), but Node still requires a READY, owned application first -
 * this endpoint must never be reachable for an arbitrary repository id.
 */
export class SourceService {
  constructor({ applicationSvc = applicationService, ciClient = codeIntelligenceClient } = {}) {
    this.applicationService = applicationSvc;
    this.codeIntelligenceClient = ciClient;
  }

  async getSource(applicationId, user, { path, startLine, endLine }) {
    const app = await this.applicationService.get(applicationId, user);
    if (app.status !== "READY") {
      throw new AppError(409, "KNOWLEDGE_BASE_NOT_READY", "This application's knowledge base is not ready yet.");
    }
    const cleanPath = requireString(path, "path");
    return this.codeIntelligenceClient.getSource(applicationId, {
      path: cleanPath,
      startLine: startLine ? Number(startLine) : undefined,
      endLine: endLine ? Number(endLine) : undefined,
    });
  }
}

export const sourceService = new SourceService();
