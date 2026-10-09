import { randomUUID } from "node:crypto";

/** Coarse application-level state, shown in the UI (spec §39). */
export const ApplicationStatus = Object.freeze({
  NEW: "NEW",
  CONFIGURING: "CONFIGURING",
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
});

// Must match app.services.postgres_repository_registry.DEFAULT_REPO_KEY on
// the Python side - it's the namespace a single-repo application's files
// live under, and Python treats it as a no-op (unprefixed) path, keeping a
// single-repo application's graph identical to before multi-repo support
// existed.
export const DEFAULT_REPO_KEY = "main";

function slugify(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Assigns each repository a repoKey - the namespace Python uses to keep
 * several physical repositories' files distinct within the one shared
 * graph an application owns (see IndexingService/GraphBuilder on the
 * Python side, and CALLS_API cross-repo linking). A single-repo
 * application always gets DEFAULT_REPO_KEY; only a genuinely multi-repo
 * application needs distinct, user-derived keys (slugified from each
 * repo's name, de-duplicated if two repos would slugify the same way).
 */
function buildRepositories(repositories) {
  if (repositories.length === 1) {
    const r = repositories[0];
    return [
      {
        id: `repo_${randomUUID()}`,
        name: (r.name && r.name.trim()) || "main",
        repoKey: DEFAULT_REPO_KEY,
        repositoryUrl: r.repositoryUrl,
        branch: r.branch,
        isPrivate: Boolean(r.isPrivate),
        accessToken: r.accessToken || null,
      },
    ];
  }

  const seen = new Set();
  return repositories.map((r, index) => {
    const label = (r.name && r.name.trim()) || `repo-${index + 1}`;
    const base = slugify(label) || `repo-${index + 1}`;
    let key = base;
    let suffix = 2;
    while (seen.has(key)) {
      key = `${base}-${suffix++}`;
    }
    seen.add(key);
    return {
      id: `repo_${randomUUID()}`,
      name: label,
      repoKey: key,
      repositoryUrl: r.repositoryUrl,
      branch: r.branch,
      isPrivate: Boolean(r.isPrivate),
      accessToken: r.accessToken || null,
    };
  });
}

/**
 * Creates a new Application record.
 *
 * `repositories` must already be field-validated (see
 * ApplicationService#create) - `{ name?, repositoryUrl, branch }[]`, at
 * least one entry. Only public-safe fields are ever returned to the
 * frontend (see toPublicApplication) - no internal workspace paths, no
 * GitLab tokens.
 */
export function createApplicationRecord({ name, aaNumber, repositories, tenantId, ownerId }) {
  const now = new Date().toISOString();
  return {
    id: `app_${randomUUID()}`,
    tenantId,
    ownerId,
    name,
    aaNumber,
    repositories: buildRepositories(repositories),
    status: ApplicationStatus.NEW,
    createdAt: now,
    updatedAt: now,
    lastIndexedAt: null,
    lastIndexedCommits: {},
    stats: {
      files: 0,
      parsedFiles: 0,
      languages: {},
      classes: 0,
      functions: 0,
      symbols: 0,
      relationships: 0,
      chunks: 0,
      embeddings: 0,
    },
    activeJobId: null,
  };
}

/** Strips fields that must never reach the browser. */
export function toPublicApplication(app) {
  return {
    id: app.id,
    name: app.name,
    aaNumber: app.aaNumber,
    // accessToken is deliberately never included - it must never reach
    // the browser once submitted, matching how repositoryUrl (never a
    // GitLab PAT, just the repo location) always has been public.
    repositories: app.repositories.map((r) => ({
      id: r.id,
      name: r.name,
      repoKey: r.repoKey,
      repositoryUrl: r.repositoryUrl,
      branch: r.branch,
      isPrivate: r.isPrivate,
    })),
    status: app.status,
    createdAt: app.createdAt,
    updatedAt: app.updatedAt,
    lastIndexedAt: app.lastIndexedAt,
    lastIndexedCommits: app.lastIndexedCommits,
    stats: app.stats,
    activeJobId: app.activeJobId,
  };
}
