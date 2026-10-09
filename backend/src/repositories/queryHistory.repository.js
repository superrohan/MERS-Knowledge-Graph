/**
 * In-memory query history, scoped per application (spec §30). Records
 * only citations (file/line refs) and metadata - never raw source text -
 * so history stays lightweight regardless of how many queries pile up.
 */
export class QueryHistoryRepository {
  constructor() {
    /** @type {Map<string, Map<string, object>>} */
    this.byApplication = new Map();
  }

  create(applicationId, record) {
    if (!this.byApplication.has(applicationId)) {
      this.byApplication.set(applicationId, new Map());
    }
    this.byApplication.get(applicationId).set(record.queryId, record);
    return record;
  }

  findById(applicationId, queryId) {
    return this.byApplication.get(applicationId)?.get(queryId);
  }

  listByApplication(applicationId) {
    return [...(this.byApplication.get(applicationId)?.values() ?? [])].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
  }
}

export const queryHistoryRepository = new QueryHistoryRepository();
