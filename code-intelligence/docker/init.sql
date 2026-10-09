-- Runs once, automatically, the first time the Postgres data directory
-- is initialized (standard docker-entrypoint-initdb.d behavior).

CREATE EXTENSION IF NOT EXISTS age;
CREATE EXTENSION IF NOT EXISTS vector;

-- One row per *physical repository* within an application. An
-- application (repository_id, = the AGE graph name - one shared graph
-- per application, not per repo) can have several rows here, one per
-- repo_key ("frontend", "backend", ...), each cloned/indexed
-- independently but landing in the same graph so cross-repo
-- relationships (e.g. a frontend fetch() call to a backend API route)
-- can exist as real edges. last_scan_stats lets the indexing service
-- report cumulative totals across every repo in the application without
-- re-scanning repos it isn't currently re-indexing.
CREATE TABLE IF NOT EXISTS repositories (
    repository_id    TEXT NOT NULL,
    repo_key         TEXT NOT NULL,
    repository_path  TEXT NOT NULL,
    graph_name       TEXT NOT NULL,
    last_scan_stats  JSONB NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (repository_id, repo_key)
);

-- security_rules: global Spring Security URL-pattern rules found in this
-- file, if any (app.parsing.api_detection.spring_security_config) -
-- persisted per-file like unresolved so an unchanged security config
-- file's rules survive incremental re-indexing without being re-parsed.
CREATE TABLE IF NOT EXISTS file_manifest (
    repository_id  TEXT NOT NULL,
    file_path      TEXT NOT NULL,
    content_hash   TEXT NOT NULL,
    unresolved     JSONB NOT NULL DEFAULT '[]',
    security_rules JSONB NOT NULL DEFAULT '[]',
    PRIMARY KEY (repository_id, file_path)
);

-- text-embedding-3-small (OpenAI) and the local hashing-trick fallback
-- both produce 1536-dim vectors, so every repository's chunks share one
-- schema regardless of which provider indexed them.
CREATE TABLE IF NOT EXISTS code_chunks (
    id            TEXT PRIMARY KEY,
    repository_id TEXT NOT NULL,
    file_path     TEXT NOT NULL,
    start_line    INT NOT NULL,
    end_line      INT NOT NULL,
    symbol_id     TEXT,
    symbol_name   TEXT,
    text          TEXT NOT NULL,
    embedding     VECTOR(1536) NOT NULL
);
CREATE INDEX IF NOT EXISTS code_chunks_repository_idx ON code_chunks (repository_id);
CREATE INDEX IF NOT EXISTS code_chunks_file_idx ON code_chunks (repository_id, file_path);
CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx
    ON code_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE IF NOT EXISTS indexing_jobs (
    id                TEXT PRIMARY KEY,
    repository_id     TEXT NOT NULL,
    repository_path   TEXT NOT NULL,
    commit_hash       TEXT,
    status            TEXT NOT NULL,
    progress          INT NOT NULL DEFAULT 0,
    message           TEXT,
    stats             JSONB NOT NULL DEFAULT '{}',
    logs              JSONB NOT NULL DEFAULT '[]',
    started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at      TIMESTAMPTZ,
    error             TEXT,
    cancel_requested  BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS indexing_jobs_repository_idx ON indexing_jobs (repository_id);

-- User-declared API/auth documentation (spec: let the user tell the
-- system about endpoints themselves). Stored as real data, materialized
-- into the graph as ordinary API-kind nodes (see
-- app/services/manual_api_annotations.py) so they show up everywhere an
-- extracted endpoint would - graph view, query citations - and survive
-- re-indexing untouched (they live outside any scanned file's namespace).
-- verification_status/notes record whether this declaration was checked
-- against the endpoints the parser actually detected in the code graph
-- (app/services/api_annotation_verification.py) - "unverified" until a
-- check has run, then "confirmed" | "conflicting" | "no_match".
CREATE TABLE IF NOT EXISTS manual_api_annotations (
    id                   TEXT PRIMARY KEY,
    repository_id        TEXT NOT NULL,
    name                 TEXT NOT NULL,
    http_method          TEXT,
    route_path           TEXT,
    auth_required        BOOLEAN NOT NULL DEFAULT false,
    auth_mechanism       TEXT,
    required_roles       JSONB NOT NULL DEFAULT '[]',
    notes                TEXT,
    reference_path       TEXT,
    verification_status  TEXT NOT NULL DEFAULT 'unverified',
    verification_notes   TEXT,
    verified_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS manual_api_annotations_repository_idx ON manual_api_annotations (repository_id);
