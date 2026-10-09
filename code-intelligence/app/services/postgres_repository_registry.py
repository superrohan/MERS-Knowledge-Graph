"""Tracks each physical repository's on-disk checkout path (for the
source-viewer endpoint) and last scan stats, keyed by
(repository_id, repo_key). One application (repository_id - also the
AGE graph name) can have several repo_key rows, one per repository the
user submitted (e.g. "frontend", "backend").
"""

from __future__ import annotations

import json

from app.db.connection import get_connection

DEFAULT_REPO_KEY = "main"


class PostgresRepositoryRegistry:
    def set_path(self, repository_id: str, repo_key: str, repository_path: str, scan_stats: dict | None = None) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO repositories (repository_id, repo_key, repository_path, graph_name, last_scan_stats)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (repository_id, repo_key) DO UPDATE SET
                    repository_path = EXCLUDED.repository_path,
                    last_scan_stats = COALESCE(%s, repositories.last_scan_stats),
                    updated_at = now()
                """,
                (
                    repository_id,
                    repo_key,
                    repository_path,
                    repository_id,
                    json.dumps(scan_stats or {}),
                    json.dumps(scan_stats) if scan_stats is not None else None,
                ),
            )
            conn.commit()

    def get_path(self, repository_id: str, repo_key: str) -> str | None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT repository_path FROM repositories WHERE repository_id = %s AND repo_key = %s",
                (repository_id, repo_key),
            )
            row = cur.fetchone()
            return row[0] if row else None

    def list_repo_keys(self, repository_id: str) -> list[str]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT repo_key FROM repositories WHERE repository_id = %s", (repository_id,))
            return [row[0] for row in cur.fetchall()]

    def get_all_scan_stats(self, repository_id: str) -> dict[str, dict]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT repo_key, last_scan_stats FROM repositories WHERE repository_id = %s", (repository_id,)
            )
            return {row[0]: row[1] for row in cur.fetchall()}

    def remove(self, repository_id: str, repo_key: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM repositories WHERE repository_id = %s AND repo_key = %s", (repository_id, repo_key)
            )
            conn.commit()

    def clear(self, repository_id: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM repositories WHERE repository_id = %s", (repository_id,))
            conn.commit()


repository_registry = PostgresRepositoryRegistry()
