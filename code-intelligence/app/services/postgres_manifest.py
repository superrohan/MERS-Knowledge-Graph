"""Per-file content-hash manifest backed by the `file_manifest` table -
same role as the old in-memory ContentManifestStore (real incremental
indexing: unchanged files are never re-parsed), just durable now.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field

from app.db.connection import get_connection
from app.parsing.base import UnresolvedReference


@dataclass
class FileManifestEntry:
    content_hash: str
    unresolved: list[UnresolvedReference] = field(default_factory=list)
    # Global Spring Security rules found in this file, if any - see
    # app.parsing.api_detection.spring_security_config and ParsedFile.
    security_rules: list[dict] = field(default_factory=list)


def _serialize_unresolved(entries: list[UnresolvedReference]) -> list[dict]:
    return [{"source_id": u.source_id, "target_name": u.target_name, "type": u.type.value} for u in entries]


def _deserialize_unresolved(rows: list[dict]) -> list[UnresolvedReference]:
    from app.domain.models import RelationshipType

    return [
        UnresolvedReference(source_id=r["source_id"], target_name=r["target_name"], type=RelationshipType(r["type"]))
        for r in rows
    ]


class PostgresManifestStore:
    def get_all(self, repository_id: str) -> dict[str, FileManifestEntry]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT file_path, content_hash, unresolved, security_rules FROM file_manifest WHERE repository_id = %s",
                (repository_id,),
            )
            return {
                row[0]: FileManifestEntry(
                    content_hash=row[1], unresolved=_deserialize_unresolved(row[2]), security_rules=row[3] or []
                )
                for row in cur.fetchall()
            }

    def set_entry(self, repository_id: str, file_path: str, entry: FileManifestEntry) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO file_manifest (repository_id, file_path, content_hash, unresolved, security_rules)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (repository_id, file_path) DO UPDATE SET
                    content_hash = EXCLUDED.content_hash,
                    unresolved = EXCLUDED.unresolved,
                    security_rules = EXCLUDED.security_rules
                """,
                (
                    repository_id,
                    file_path,
                    entry.content_hash,
                    json.dumps(_serialize_unresolved(entry.unresolved)),
                    json.dumps(entry.security_rules),
                ),
            )
            conn.commit()

    def remove_entry(self, repository_id: str, file_path: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM file_manifest WHERE repository_id = %s AND file_path = %s", (repository_id, file_path)
            )
            conn.commit()

    def clear(self, repository_id: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM file_manifest WHERE repository_id = %s", (repository_id,))
            conn.commit()


manifest_store = PostgresManifestStore()
