import { AppError } from "../middleware/errorHandler.js";
import { createApplicationRecord, toPublicApplication } from "../models/application.js";
import { applicationRepository } from "../repositories/application.repository.js";
import { requireGitLabUrl, requireString } from "../utils/validation.js";

export class ApplicationService {
  constructor(repository = applicationRepository) {
    this.repository = repository;
  }

  async create({ name, aaNumber, repositoryUrl, branch, accessToken, isPrivate, repositories }, user) {
    const cleanName = requireString(name, "Application name");
    const cleanAaNumber = requireString(aaNumber, "AA/application number");
    const cleanRepositories = this._validateRepositories({ repositoryUrl, branch, accessToken, isPrivate, repositories });

    const app = createApplicationRecord({
      name: cleanName,
      aaNumber: cleanAaNumber,
      repositories: cleanRepositories,
      tenantId: user.tenantId,
      ownerId: user.id,
    });

    await this.repository.create(app);
    return toPublicApplication(app);
  }

  /**
   * Accepts either the legacy single-repo shape (`repositoryUrl`/`branch`
   * at the top level) or the multi-repo `repositories: [{ name?,
   * repositoryUrl, branch?, isPrivate?, accessToken? }]` array - a
   * request submitting one repo via either shape behaves identically.
   * Every entry's URL/branch is validated the same way a single-repo
   * request always was; a repo marked private must also supply the
   * access token needed to clone it (there's no server-wide fallback
   * that could work for an arbitrary user's private project).
   */
  _validateRepositories({ repositoryUrl, branch, accessToken, isPrivate, repositories }) {
    const inputs =
      Array.isArray(repositories) && repositories.length > 0 ? repositories : [{ repositoryUrl, branch, accessToken, isPrivate }];

    if (inputs.length > 1) {
      for (const [index, r] of inputs.entries()) {
        requireString(r.name, `Repository #${index + 1} name`);
      }
    }

    return inputs.map((r, index) => {
      const cleanIsPrivate = Boolean(r.isPrivate);
      const cleanAccessToken = typeof r.accessToken === "string" ? r.accessToken.trim() : "";
      if (cleanIsPrivate && !cleanAccessToken) {
        const label = inputs.length > 1 ? `Repository "${r.name ?? index + 1}"` : "This repository";
        throw new AppError(
          400,
          "VALIDATION_ERROR",
          `${label} is marked private - an access token is required to clone it.`,
        );
      }
      return {
        name: typeof r.name === "string" ? r.name.trim() : undefined,
        repositoryUrl: requireGitLabUrl(r.repositoryUrl),
        branch: r.branch && r.branch.trim().length > 0 ? r.branch.trim() : "main",
        isPrivate: cleanIsPrivate,
        accessToken: cleanIsPrivate ? cleanAccessToken : undefined,
      };
    });
  }

  async list(user) {
    const apps = await this.repository.listByTenant(user.tenantId);
    return apps.map(toPublicApplication);
  }

  async get(id, user) {
    const app = await this.repository.findById(id, user.tenantId);
    if (!app) {
      throw new AppError(404, "APPLICATION_NOT_FOUND", `No application found with id ${id}.`);
    }
    return toPublicApplication(app);
  }

  /** Internal (non-public) view - used by services that need
   * repositories[].repositoryUrl/branch/accessToken/etc. */
  async getInternal(id, user) {
    const app = await this.repository.findById(id, user.tenantId);
    if (!app) {
      throw new AppError(404, "APPLICATION_NOT_FOUND", `No application found with id ${id}.`);
    }
    return app;
  }

  async update(id, user, patch) {
    const updated = await this.repository.update(id, user.tenantId, patch);
    if (!updated) {
      throw new AppError(404, "APPLICATION_NOT_FOUND", `No application found with id ${id}.`);
    }
    return updated;
  }

  async delete(id, user) {
    const deleted = await this.repository.delete(id, user.tenantId);
    if (!deleted) {
      throw new AppError(404, "APPLICATION_NOT_FOUND", `No application found with id ${id}.`);
    }
  }
}

export const applicationService = new ApplicationService();
