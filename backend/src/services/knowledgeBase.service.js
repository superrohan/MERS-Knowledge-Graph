import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
import { AppError } from "../middleware/errorHandler.js";
import { applicationService } from "./application.service.js";

export class KnowledgeBaseService {
  constructor({ applicationSvc = applicationService, ciClient = codeIntelligenceClient } = {}) {
    this.applicationService = applicationSvc;
    this.codeIntelligenceClient = ciClient;
  }

  async getOverview(applicationId, user) {
    return this.applicationService.get(applicationId, user);
  }

  async getStats(applicationId, user) {
    const app = await this._requireReady(applicationId, user);
    return this.codeIntelligenceClient.getRepositoryStats(app.id);
  }

  async getGraph(applicationId, user, filters) {
    const app = await this._requireReady(applicationId, user);
    return this.codeIntelligenceClient.getGraph(app.id, filters);
  }

  async _requireReady(applicationId, user) {
    const app = await this.applicationService.get(applicationId, user);
    if (app.status !== "READY") {
      throw new AppError(409, "KNOWLEDGE_BASE_NOT_READY", "This application's knowledge base is not ready yet.");
    }
    return app;
  }
}

export const knowledgeBaseService = new KnowledgeBaseService();
