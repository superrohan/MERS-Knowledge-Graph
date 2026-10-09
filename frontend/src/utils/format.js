export function formatNumber(value) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US");
}

export function formatDate(isoString) {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" });
}

export function formatRelativeTime(isoString) {
  if (!isoString) return "";
  const then = new Date(isoString).getTime();
  const diffMs = Date.now() - then;
  const diffSec = Math.round(diffMs / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
  const diffHour = Math.round(diffMin / 60);
  if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
  const diffDay = Math.round(diffHour / 24);
  if (diffDay === 1) return "Yesterday";
  if (diffDay < 7) return `${diffDay} days ago`;
  return formatDate(isoString);
}

/** Extracts "namespace/project" from a GitLab URL for compact display. */
export function repositoryLabel(repositoryUrl) {
  if (!repositoryUrl) return "";
  try {
    if (repositoryUrl.startsWith("file://")) {
      return repositoryUrl.replace("file://", "").split("/").filter(Boolean).slice(-2).join("/");
    }
    const url = new URL(repositoryUrl);
    return url.pathname.replace(/^\//, "").replace(/\.git$/, "");
  } catch {
    return repositoryUrl;
  }
}

/**
 * An application can span several physical repositories (e.g. a
 * "frontend" and a "backend" repo sharing one knowledge graph) - this
 * gives a compact one-line summary for cards/headers: the single repo's
 * label when there's just one (unchanged from before multi-repo
 * support), or "N repositories" otherwise. Use `application.repositories`
 * directly (with each entry's own `name`/`repositoryUrl`) when the full
 * list needs to be shown, e.g. in a detail page.
 */
export function repositorySummary(application) {
  const repos = application?.repositories ?? [];
  if (repos.length === 0) return "";
  if (repos.length === 1) return repositoryLabel(repos[0].repositoryUrl);
  return `${repos.length} repositories`;
}

/** Short commit hash(es) for a completed index run, across every
 * repository in the application - keyed by repoKey. Already shortened to
 * display width, so callers should render this string as-is. */
export function commitSummary(application) {
  const commits = application?.lastIndexedCommits ?? {};
  const values = Object.values(commits).filter(Boolean);
  if (values.length === 0) return null;
  return values.map((c) => c.slice(0, 10)).join(", ");
}
