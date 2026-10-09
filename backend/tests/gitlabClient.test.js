import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { gitlabClient } from "../src/clients/gitlab.client.js";
import { createTempGitRepo } from "./helpers/tempGitRepo.js";

describe("gitlabClient (file:// scheme, real git CLI)", () => {
  let repo;
  let cloneDir;

  beforeEach(async () => {
    repo = await createTempGitRepo();
    cloneDir = await mkdtemp(join(tmpdir(), "gitlab-clone-"));
  });

  afterEach(async () => {
    await repo.cleanup();
    await rm(cloneDir, { recursive: true, force: true });
  });

  it("validates a repository that exists", async () => {
    const info = await gitlabClient.validateRepository(repo.url);
    expect(info.defaultBranch).toBe("main");
  });

  it("rejects a repository that does not exist", async () => {
    await expect(gitlabClient.validateRepository(`${repo.url}-missing`)).rejects.toMatchObject({
      code: "GITLAB_REPOSITORY_NOT_FOUND",
    });
  });

  it("lists branches including main", async () => {
    const branches = await gitlabClient.listBranches(repo.url);
    expect(branches.map((b) => b.name)).toContain("main");
    expect(branches.find((b) => b.name === "main").isDefault).toBe(true);
  });

  it("gets the latest commit for a branch", async () => {
    const commit = await gitlabClient.getLatestCommit(repo.url, "main");
    expect(commit.sha).toMatch(/^[0-9a-f]{40}$/);
  });

  it("throws a friendly error for an unknown branch", async () => {
    await expect(gitlabClient.getLatestCommit(repo.url, "does-not-exist")).rejects.toMatchObject({
      code: "GITLAB_BRANCH_NOT_FOUND",
    });
  });

  it("clones the repository to a local path", async () => {
    const dest = join(cloneDir, "checkout");
    const result = await gitlabClient.cloneRepository(repo.url, "main", dest);
    expect(result.commitSha).toMatch(/^[0-9a-f]{40}$/);

    const cloned = await import("node:fs/promises");
    const files = await cloned.readdir(join(dest, "src", "services"));
    expect(files).toContain("auth_service.py");
  });
});
