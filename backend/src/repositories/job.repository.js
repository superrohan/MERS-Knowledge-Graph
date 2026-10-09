import { createJobRecord } from "../models/job.js";

export class JobRepository {
  constructor() {
    /** @type {Map<string, object>} */
    this.byId = new Map();
    this._seq = 0;
  }

  create(applicationId) {
    const job = createJobRecord(applicationId);
    this.byId.set(job.id, { ...job, _seq: this._seq++ });
    return job;
  }

  findById(id) {
    return this.byId.get(id);
  }

  update(id, patch) {
    const existing = this.byId.get(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    this.byId.set(id, updated);
    return updated;
  }

  listByApplication(applicationId) {
    return [...this.byId.values()]
      .filter((job) => job.applicationId === applicationId)
      .sort((a, b) => b._seq - a._seq);
  }
}

export const jobRepository = new JobRepository();
