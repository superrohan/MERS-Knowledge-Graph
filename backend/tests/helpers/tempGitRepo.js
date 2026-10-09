import { execFile } from "node:child_process";
import { cp, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const FIXTURE_REPO = join(import.meta.dirname, "..", "..", "..", "test-repository");

/**
 * Creates a throwaway local git repository (branch "main") seeded with the
 * project's test-repository fixture, so GitLab-integration code can be
 * exercised against a real git remote without network access or
 * credentials. Returns a file:// URL and a cleanup function.
 */
export async function createTempGitRepo() {
  const dir = await mkdtemp(join(tmpdir(), "gitlab-fixture-"));
  await cp(FIXTURE_REPO, dir, { recursive: true });

  const run = (args) => execFileAsync("git", args, { cwd: dir });
  await run(["init", "-q", "-b", "main"]);
  await run(["config", "user.email", "fixture@example.com"]);
  await run(["config", "user.name", "Fixture"]);
  await run(["add", "-A"]);
  await run(["commit", "-q", "-m", "Fixture commit"]);

  return {
    url: `file://${dir}`,
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}
