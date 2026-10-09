/**
 * Parses a GitLab repository URL into a normalized shape.
 *
 * Supports three forms:
 *  - https://gitlab.example.com/group/subgroup/project(.git)  -> "http"
 *  - git@gitlab.example.com:group/project.git                 -> "ssh"
 *  - file:///local/path/to/repo.git                           -> "file"
 *    (local fixture repositories, used for dev/testing without live GitLab)
 */
export function parseGitLabUrl(rawUrl) {
  const url = rawUrl.trim();

  if (url.startsWith("file://")) {
    return { scheme: "file", remoteUrl: url, path: url.replace("file://", "") };
  }

  const sshMatch = url.match(/^git@([^:]+):(.+?)(\.git)?$/);
  if (sshMatch) {
    const [, host, projectPath] = sshMatch;
    return {
      scheme: "ssh",
      remoteUrl: url,
      host,
      apiBaseUrl: `https://${host}`,
      projectPath: projectPath.replace(/\.git$/, ""),
    };
  }

  const parsed = new URL(url);
  const projectPath = parsed.pathname.replace(/^\//, "").replace(/\.git$/, "");
  return {
    scheme: "http",
    remoteUrl: url,
    host: parsed.host,
    apiBaseUrl: `${parsed.protocol}//${parsed.host}`,
    projectPath,
  };
}
