import { codeIntelligenceClient } from "../clients/code-intelligence.client.js";
import { AppError } from "../middleware/errorHandler.js";
import { queryHistoryRepository } from "../repositories/queryHistory.repository.js";
import { applicationService } from "./application.service.js";
import { requireString } from "../utils/validation.js";

/**
 * Enforces spec §32: application must exist, belong to the caller's
 * tenant, and have a READY knowledge base before any query runs.
 */
export class QueryService {
  constructor({ applicationSvc = applicationService, ciClient = codeIntelligenceClient, historyRepo = queryHistoryRepository } = {}) {
    this.applicationService = applicationSvc;
    this.codeIntelligenceClient = ciClient;
    this.historyRepository = historyRepo;
  }

  async query(applicationId, user, queryText) {
    const app = await this.applicationService.get(applicationId, user);
    this._requireReady(app);
    const clean = requireString(queryText, "query");

    const result = await this.codeIntelligenceClient.query({ repositoryId: applicationId, query: clean });

    const record = {
      queryId: result.queryId,
      applicationId,
      query: result.query,
      queryType: result.queryType,
      answer: result.answer,
      basis: result.basis,
      citations: result.citations,
      graphPath: result.graphPath,
      metadata: result.metadata,
      createdAt: new Date().toISOString(),
    };
    this.historyRepository.create(applicationId, record);
    return record;
  }

  async getHistory(applicationId, user) {
    await this.applicationService.get(applicationId, user);
    return this.historyRepository.listByApplication(applicationId).map((record) => ({
      queryId: record.queryId,
      query: record.query,
      createdAt: record.createdAt,
      answerPreview: record.answer.slice(0, 160),
    }));
  }

  async getHistoryItem(applicationId, queryId, user) {
    await this.applicationService.get(applicationId, user);
    const record = this.historyRepository.findById(applicationId, queryId);
    if (!record) {
      throw new AppError(404, "QUERY_NOT_FOUND", `No query found with id ${queryId}.`);
    }
    return record;
  }

  _requireReady(app) {
    if (app.status !== "READY") {
      throw new AppError(
        409,
        "KNOWLEDGE_BASE_NOT_READY",
        "This application's knowledge base is not ready yet. Start analysis first.",
      );
    }
  }
}

export const queryService = new QueryService();
