import { execFile } from "node:child_process";
import { promisify } from "node:util";

import axios from "axios";
import simpleGit from "simple-git";

import { env } from "../config/env.js";
import { AppError } from "../middleware/errorHandler.js";
import { parseGitLabUrl } from "../utils/gitlabUrl.js";

const execFileAsync = promisify(execFile);

function gitlabApi(apiBaseUrl, accessToken) {
  const token = accessToken || env.gitlabToken;
  return axios.create({
    baseURL: `${apiBaseUrl}/api/v4`,
    timeout: 10000,
    headers: token ? { "PRIVATE-TOKEN": token } : {},
  });
}

// A per-repository access token (supplied by the user for a private
// repo, since a single application can span repos in different
// namespaces/orgs that no single server-wide token could reach) always
// wins over the server-wide env.gitlabToken fallback.
function authenticatedCloneUrl(remoteUrl, accessToken) {
  const token = accessToken || env.gitlabToken;
  if (!token) return remoteUrl;
  try {
    const url = new URL(remoteUrl);
    url.username = "oauth2";
    url.password = token;
    return url.toString();
  } catch {
    return remoteUrl;
  }
}

function mapGitLabApiError(err, projectPath) {
  if (err.response) {
    if (err.response.status === 404) {
      return new AppError(
        404,
        "GITLAB_REPOSITORY_NOT_FOUND",
        `Repository "${projectPath}" was not found, or is not accessible with the configured GitLab credentials.`,
      );
    }
    if (err.response.status === 401 || err.response.status === 403) {
      return new AppError(
        401,
        "GITLAB_AUTHENTICATION_FAILED",
        "GitLab rejected the configured access token for this repository.",
      );
    }
    return new AppError(502, "GITLAB_ERROR", `GitLab returned an unexpected error (${err.response.status}).`);
  }
  return new AppError(502, "GITLAB_UNREACHABLE", "Could not reach GitLab. It may be down or unreachable from this server.");
}

/**
 * Real GitLab integration, behind a small functional interface so the
 * caller (GitLabService) never has to know whether a given URL is a
 * hosted GitLab project (validated via the REST API) or a local git
 * remote such as file:// (validated via the git CLI, used for
 * development and automated end-to-end tests without live GitLab access).
 */
export const gitlabClient = {
  /** @returns {Promise<{name: string, defaultBranch: string, webUrl: string, visibility: string}>} */
  async validateRepository(repositoryUrl, accessToken) {
    const parsed = parseGitLabUrl(repositoryUrl);

    if (parsed.scheme === "file" || parsed.scheme === "ssh") {
      try {
        await execFileAsync("git", ["ls-remote", "--heads", parsed.remoteUrl], { timeout: 15000 });
      } catch {
        throw new AppError(
          404,
          "GITLAB_REPOSITORY_NOT_FOUND",
          `Could not access repository at ${repositoryUrl}. Check the URL and that it is reachable from the server.`,
        );
      }
      return {
        name: parsed.remoteUrl.split("/").pop().replace(/\.git$/, ""),
        defaultBranch: "main",
        webUrl: parsed.remoteUrl,
        visibility: "unknown",
      };
    }

    const api = gitlabApi(parsed.apiBaseUrl, accessToken);
    try {
      const res = await api.get(`/projects/${encodeURIComponent(parsed.projectPath)}`);
      return {
        name: res.data.name,
        defaultBranch: res.data.default_branch ?? "main",
        webUrl: res.data.web_url,
        visibility: res.data.visibility,
      };
    } catch (err) {
      throw mapGitLabApiError(err, parsed.projectPath);
    }
  },

  /** @returns {Promise<Array<{name: string, isDefault: boolean, commitId: string}>>} */
  async listBranches(repositoryUrl, accessToken) {
    const parsed = parseGitLabUrl(repositoryUrl);

    if (parsed.scheme === "file" || parsed.scheme === "ssh") {
      let stdout;
      try {
        ({ stdout } = await execFileAsync("git", ["ls-remote", "--heads", parsed.remoteUrl], { timeout: 15000 }));
      } catch {
        throw new AppError(404, "GITLAB_REPOSITORY_NOT_FOUND", `Could not list branches for ${repositoryUrl}.`);
      }
      const branches = stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [commitId, ref] = line.split("\t");
          return { name: ref.replace("refs/heads/", ""), isDefault: false, commitId };
        });
      if (branches.length > 0) {
        const main = branches.find((b) => b.name === "main" || b.name === "master");
        if (main) main.isDefault = true;
      }
      return branches;
    }

    const api = gitlabApi(parsed.apiBaseUrl, accessToken);
    try {
      const projectRes = await api.get(`/projects/${encodeURIComponent(parsed.projectPath)}`);
      const defaultBranch = projectRes.data.default_branch;
      const branchesRes = await api.get(`/projects/${projectRes.data.id}/repository/branches`, {
        params: { per_page: 100 },
      });
      return branchesRes.data.map((b) => ({
        name: b.name,
        isDefault: b.name === defaultBranch,
        commitId: b.commit?.id,
      }));
    } catch (err) {
      throw mapGitLabApiError(err, parsed.projectPath);
    }
  },

  /** @returns {Promise<{sha: string, message: string, authoredDate: string}>} */
  async getLatestCommit(repositoryUrl, branch, accessToken) {
    const parsed = parseGitLabUrl(repositoryUrl);

    if (parsed.scheme === "file" || parsed.scheme === "ssh") {
      const { stdout } = await execFileAsync("git", ["ls-remote", parsed.remoteUrl, `refs/heads/${branch}`], {
        timeout: 15000,
      });
      const sha = stdout.split("\t")[0]?.trim();
      if (!sha) {
        throw new AppError(404, "GITLAB_BRANCH_NOT_FOUND", `Branch "${branch}" was not found.`);
      }
      return { sha, message: "", authoredDate: new Date().toISOString() };
    }

    const api = gitlabApi(parsed.apiBaseUrl, accessToken);
    try {
      const projectRes = await api.get(`/projects/${encodeURIComponent(parsed.projectPath)}`);
      const commitRes = await api.get(
        `/projects/${projectRes.data.id}/repository/branches/${encodeURIComponent(branch)}`,
      );
      return {
        sha: commitRes.data.commit.id,
        message: commitRes.data.commit.message,
        authoredDate: commitRes.data.commit.authored_date,
      };
    } catch (err) {
      if (err.response?.status === 404) {
        throw new AppError(404, "GITLAB_BRANCH_NOT_FOUND", `Branch "${branch}" was not found.`);
      }
      throw mapGitLabApiError(err, parsed.projectPath);
    }
  },

  /**
   * Clones the repository at `branch` into `destPath` on the Node server's
   * local disk. Node never ships repository *contents* through JSON - only
   * this local path is handed to the Python service.
   * @returns {Promise<{path: string, commitSha: string}>}
   */
  async cloneRepository(repositoryUrl, branch, destPath, accessToken) {
    const parsed = parseGitLabUrl(repositoryUrl);
    const cloneUrl = parsed.scheme === "http" ? authenticatedCloneUrl(parsed.remoteUrl, accessToken) : parsed.remoteUrl;

    try {
      const git = simpleGit();
      await git.clone(cloneUrl, destPath, ["--branch", branch, "--single-branch", "--depth", "1"]);
    } catch (err) {
      throw new AppError(
        502,
        "GITLAB_CLONE_FAILED",
        `Failed to clone branch "${branch}" from the repository.`,
        env.nodeEnv === "development" ? err.message : undefined,
      );
    }

    const repoGit = simpleGit(destPath);
    const commitSha = (await repoGit.revparse(["HEAD"])).trim();
    return { path: destPath, commitSha };
  },
};
