-- The Node backend's own platform data (users, sessions, applications,
-- and each application's repositories) - a separate concern from the
-- Python code-intelligence tables in 01-init.sql, co-located in the same
-- Postgres instance so there's only one database to operate. Table names
-- are prefixed app_* specifically so the two schemas can never collide.
--
-- Every secret column here is encrypted/hashed before a row is ever
-- written (see backend/src/utils/crypto.js and password.js) - a
-- password is never stored as anything but a salted scrypt hash, a
-- session token is only ever looked up by its SHA-256 hash (never
-- stored raw), and a GitLab access token is AES-256-GCM encrypted at
-- rest, decrypted only in-process when actually needed to clone a repo.

CREATE TABLE IF NOT EXISTS app_users (
    id            TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    -- Each user is their own tenant today - there's no shared team/org
    -- membership model yet, so this is the simplest way to guarantee
    -- "a user only ever sees their own applications" (spec §50). Kept as
    -- its own column (not derived from id at query time) so a future
    -- real multi-user-tenant/team feature is a data migration, not an
    -- API shape change - every downstream query already scopes by
    -- tenant_id, not by owner_id.
    tenant_id     TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- token_hash is SHA-256 of the actual bearer token handed to the browser
-- - the raw token is never persisted, the same reasoning as a password
-- hash: a database compromise should not itself grant every active
-- session.
CREATE TABLE IF NOT EXISTS app_sessions (
    token_hash TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_sessions_user_idx ON app_sessions (user_id);

CREATE TABLE IF NOT EXISTS app_applications (
    id                   TEXT PRIMARY KEY,
    tenant_id            TEXT NOT NULL,
    owner_id             TEXT NOT NULL,
    name                 TEXT NOT NULL,
    aa_number            TEXT NOT NULL,
    status               TEXT NOT NULL,
    stats                JSONB NOT NULL DEFAULT '{}',
    last_indexed_at      TIMESTAMPTZ,
    last_indexed_commits JSONB NOT NULL DEFAULT '{}',
    active_job_id        TEXT,
    -- A monotonic tiebreaker for "newest first" listing - two
    -- applications created within the same clock tick (or updated to
    -- the same updated_at) must still sort deterministically.
    seq                  BIGSERIAL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_applications_tenant_idx ON app_applications (tenant_id);

-- One row per physical repository an application spans (see
-- backend/src/models/application.js#buildRepositories) - written once
-- at application-creation time and never patched afterwards, so a
-- repository's access token is set exactly once and simply reused
-- (decrypted in-process) on every later re-index.
CREATE TABLE IF NOT EXISTS app_repositories (
    id                     TEXT PRIMARY KEY,
    application_id         TEXT NOT NULL REFERENCES app_applications(id) ON DELETE CASCADE,
    repo_key               TEXT NOT NULL,
    name                   TEXT NOT NULL,
    repository_url         TEXT NOT NULL,
    branch                 TEXT NOT NULL,
    is_private             BOOLEAN NOT NULL DEFAULT false,
    encrypted_access_token TEXT,
    position               INT NOT NULL DEFAULT 0,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_repositories_application_idx ON app_repositories (application_id);
