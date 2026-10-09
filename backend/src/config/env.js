/**
 * Centralized environment configuration.
 *
 * All secrets (GitLab token, internal shared secret, session/token
 * encryption keys) live only here and only in this process. Nothing in
 * this module is ever sent to the React frontend.
 */

function optional(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

export const env = {
  nodeEnv: optional("NODE_ENV", "development"),
  port: Number(optional("PORT", "4000")),

  // Internal Python code-intelligence service. Never exposed to the browser.
  pythonServiceUrl: optional("PYTHON_SERVICE_URL", "http://127.0.0.1:8000"),
  internalServiceSecret: optional(
    "INTERNAL_SERVICE_SECRET",
    "dev-internal-secret-change-me",
  ),

  // GitLab integration.
  gitlabBaseUrl: optional("GITLAB_URL", "https://gitlab.com"),
  gitlabToken: optional("GITLAB_TOKEN", ""),

  // Where repositories are cloned to on local disk before Python indexes
  // them. Kept around (not deleted) after indexing so re-index and the
  // source viewer can reuse the same checkout.
  workspaceRoot: optional("WORKSPACE_ROOT", "/tmp/code-intelligence-workspaces"),

  // Node's own platform data (users/sessions/applications/repositories) -
  // the same physical Postgres instance the code-intelligence service
  // uses, in its own app_*-prefixed tables (see
  // code-intelligence/docker/init-node-platform.sql).
  databaseUrl: optional(
    "DATABASE_URL",
    "postgresql://code_intelligence:code_intelligence@127.0.0.1:5433/code_intelligence",
  ),

  // AES-256-GCM key (32 bytes, hex-encoded = 64 hex chars) a GitLab
  // access token is encrypted with before it's ever written to a
  // database row - see utils/crypto.js. Generate a real one with
  // `openssl rand -hex 32` and set it via env in any environment that
  // isn't a throwaway local dev database; the value below is a public,
  // committed placeholder, exactly as insecure as it looks.
  tokenEncryptionKey: optional(
    "TOKEN_ENCRYPTION_KEY",
    "8be3428d9e920aaa086e07f79cdf1aa6cd2c62dddea8f8b9f65ad93fd94c0636",
  ),

  // How long a login session stays valid before it must be renewed.
  sessionTtlMs: Number(optional("SESSION_TTL_MS", String(30 * 24 * 60 * 60 * 1000))), // 30 days
};
