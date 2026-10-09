import { gitlabClient } from "../clients/gitlab.client.js";
import { AppError } from "../middleware/errorHandler.js";
import { isValidGitLabUrl } from "../utils/validation.js";

/**
 * Thin orchestration layer over GitLabClient. Kept separate so routes
 * never talk to the client directly, and so GitLab-specific error
 * shaping lives in one place.
 *
 * `accessToken` is always optional and always per-call: a private
 * repository (or a multi-repo application whose repos live under
 * different GitLab namespaces/orgs, each needing their own PAT) supplies
 * one explicitly; a public repository or one already reachable via the
 * server-wide GITLAB_TOKEN env var needs none. See GitLabClient for the
 * fallback precedence.
 */
export class GitLabService {
  constructor(client = gitlabClient) {
    this.client = client;
  }

  async validateRepository(repositoryUrl, accessToken) {
    if (!isValidGitLabUrl(repositoryUrl)) {
      throw new AppError(400, "VALIDATION_ERROR", "Enter a valid GitLab repository URL.");
    }
    const repository = await this.client.validateRepository(repositoryUrl, accessToken);
    const branches = await this.client.listBranches(repositoryUrl, accessToken);
    return { repository, defaultBranch: repository.defaultBranch, branches: branches.map((b) => b.name) };
  }

  async listBranches(repositoryUrl, accessToken) {
    if (!isValidGitLabUrl(repositoryUrl)) {
      throw new AppError(400, "VALIDATION_ERROR", "Enter a valid GitLab repository URL.");
    }
    return this.client.listBranches(repositoryUrl, accessToken);
  }

  async prepareRepository(repositoryUrl, branch, destPath, accessToken) {
    await this.client.getLatestCommit(repositoryUrl, branch, accessToken); // fail fast if branch is wrong
    return this.client.cloneRepository(repositoryUrl, branch, destPath, accessToken);
  }
}

export const gitlabService = new GitLabService();
