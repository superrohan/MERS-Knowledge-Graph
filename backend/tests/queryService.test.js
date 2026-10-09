import { beforeEach, describe, expect, it, vi } from "vitest";

import { applicationRepository } from "../src/repositories/application.repository.js";
import { applicationService } from "../src/services/application.service.js";
import { QueryService } from "../src/services/query.service.js";

const user = { id: "dev-user", tenantId: "dev-tenant" };

describe("QueryService", () => {
  let app;

  beforeEach(async () => {
    await applicationRepository.clear();
    app = await applicationService.create(
      { name: "Fixture App", aaNumber: "AA-1", repositoryUrl: "https://gitlab.com/team/fixture", branch: "main" },
      user,
    );
  });

  it("rejects querying an application that is not READY", async () => {
    const ciClient = { query: vi.fn() };
    const service = new QueryService({ ciClient });

    await expect(service.query(app.id, user, "How does auth work?")).rejects.toMatchObject({
      code: "KNOWLEDGE_BASE_NOT_READY",
    });
    expect(ciClient.query).not.toHaveBeenCalled();
  });

  it("queries Python and stores the result in history once the app is READY", async () => {
    await applicationService.update(app.id, user, { status: "READY" });
    const ciClient = {
      query: vi.fn().mockResolvedValue({
        queryId: "query_1",
        query: "How does auth work?",
        queryType: "hybrid",
        answer: "AuthService handles it.",
        basis: "FACT",
        citations: [{ filePath: "src/services/auth_service.py", startLine: 31, endLine: 72 }],
        graphPath: [],
        metadata: { filesRetrieved: 1, symbolsRetrieved: 1, graphNodesRetrieved: 1 },
      }),
    };
    const service = new QueryService({ ciClient });

    const result = await service.query(app.id, user, "How does auth work?");
    expect(result.answer).toBe("AuthService handles it.");
    expect(ciClient.query).toHaveBeenCalledWith({ repositoryId: app.id, query: "How does auth work?" });

    const history = await service.getHistory(app.id, user);
    expect(history).toHaveLength(1);
    expect(history[0].query).toBe("How does auth work?");

    const item = await service.getHistoryItem(app.id, "query_1", user);
    expect(item.citations).toHaveLength(1);
  });

  it("404s for a query id that doesn't exist", async () => {
    const service = new QueryService({ ciClient: { query: vi.fn() } });
    await expect(service.getHistoryItem(app.id, "query_missing", user)).rejects.toThrowError();
  });
});
