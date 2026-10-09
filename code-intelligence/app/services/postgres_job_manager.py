"""Job tracking backed by the `indexing_jobs` table - job state now
survives a service restart, and multiple Python service instances could
share it (a real prerequisite for the "later becomes Celery/BullMQ"
migration the original spec anticipated).
"""

from __future__ import annotations

import json
import time
import uuid

from app.db.connection import get_connection

STAGE_MESSAGES = {
    "SCANNING": "Scanning repository",
    "PARSING": "Parsing source files",
    "BUILDING_GRAPH": "Building knowledge graph",
    "CREATING_CHUNKS": "Creating semantic chunks",
    "GENERATING_EMBEDDINGS": "Generating embeddings",
    "BUILDING_VECTOR_INDEX": "Building vector index",
    "FINALIZING": "Finalizing",
    "COMPLETED": "Indexing complete",
    "FAILED": "Indexing failed",
    "CANCELLED": "Indexing cancelled",
}

_DEFAULT_STATS = {"files": 0, "pythonFiles": 0, "symbols": 0, "relationships": 0, "chunks": 0, "embeddings": 0}


class Job:
    """Read-only snapshot of a job row, in the same shape the rest of
    the app (API routes, IndexingService) already expects."""

    def __init__(self, row: dict):
        self.id = row["id"]
        self.repository_id = row["repository_id"]
        self.repository_path = row["repository_path"]
        self.commit_hash = row["commit_hash"]
        self.status = row["status"]
        self.progress = row["progress"]
        self.message = row["message"]
        self.stats = row["stats"]
        self.logs = row["logs"]
        self.started_at = row["started_at"]
        self.completed_at = row["completed_at"]
        self.error = row["error"]
        self.cancel_requested = row["cancel_requested"]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "repositoryId": self.repository_id,
            "status": self.status,
            "progress": self.progress,
            "message": self.message,
            "stats": self.stats,
            "logs": self.logs[-200:],
            "startedAt": self.started_at.timestamp() if self.started_at else None,
            "completedAt": self.completed_at.timestamp() if self.completed_at else None,
            "error": self.error,
            "commitHash": self.commit_hash,
        }


class PostgresJobManager:
    def create(self, repository_id: str, repository_path: str, commit_hash: str | None = None) -> Job:
        job_id = f"job_{uuid.uuid4()}"
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO indexing_jobs (id, repository_id, repository_path, commit_hash, status, progress, message, stats, logs)
                VALUES (%s, %s, %s, %s, 'SCANNING', 0, %s, %s, %s)
                """,
                (
                    job_id,
                    repository_id,
                    repository_path,
                    commit_hash,
                    STAGE_MESSAGES["SCANNING"],
                    json.dumps(_DEFAULT_STATS),
                    json.dumps([{"timestamp": time.time(), "message": "Queued"}]),
                ),
            )
            conn.commit()
        return self.get(job_id)

    def get(self, job_id: str) -> Job | None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, repository_id, repository_path, commit_hash, status, progress, message,"
                " stats, logs, started_at, completed_at, error, cancel_requested"
                " FROM indexing_jobs WHERE id = %s",
                (job_id,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            columns = [
                "id", "repository_id", "repository_path", "commit_hash", "status", "progress", "message",
                "stats", "logs", "started_at", "completed_at", "error", "cancel_requested",
            ]
            return Job(dict(zip(columns, row)))

    def request_cancel(self, job_id: str) -> bool:
        job = self.get(job_id)
        if job is None or job.status in ("COMPLETED", "FAILED", "CANCELLED"):
            return False
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("UPDATE indexing_jobs SET cancel_requested = true WHERE id = %s", (job_id,))
            conn.commit()
        return True

    def update_progress(self, job_id: str, status: str, progress: int, message: str | None = None, stats: dict | None = None) -> None:
        job = self.get(job_id)
        if job is None:
            return
        merged_stats = {**job.stats, **(stats or {})}
        resolved_message = message or STAGE_MESSAGES.get(status, status)
        logs = [*job.logs, {"timestamp": time.time(), "message": resolved_message}]
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE indexing_jobs SET status = %s, progress = %s, message = %s, stats = %s, logs = %s WHERE id = %s",
                (status, progress, resolved_message, json.dumps(merged_stats), json.dumps(logs), job_id),
            )
            conn.commit()

    def mark_completed(self, job_id: str, stats: dict, commit_hash: str | None = None) -> None:
        job = self.get(job_id)
        if job is None:
            return
        merged_stats = {**job.stats, **stats}
        message = STAGE_MESSAGES["COMPLETED"]
        logs = [*job.logs, {"timestamp": time.time(), "message": message}]
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE indexing_jobs
                SET status = 'COMPLETED', progress = 100, message = %s, stats = %s, logs = %s,
                    completed_at = now(), commit_hash = COALESCE(%s, commit_hash)
                WHERE id = %s
                """,
                (message, json.dumps(merged_stats), json.dumps(logs), commit_hash, job_id),
            )
            conn.commit()

    def mark_failed(self, job_id: str, error: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        message = STAGE_MESSAGES["FAILED"]
        logs = [*job.logs, {"timestamp": time.time(), "message": f"Failed: {error}"}]
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE indexing_jobs SET status = 'FAILED', error = %s, message = %s, logs = %s, completed_at = now() WHERE id = %s",
                (error, message, json.dumps(logs), job_id),
            )
            conn.commit()

    def mark_cancelled(self, job_id: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        message = STAGE_MESSAGES["CANCELLED"]
        logs = [*job.logs, {"timestamp": time.time(), "message": message}]
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "UPDATE indexing_jobs SET status = 'CANCELLED', message = %s, logs = %s, completed_at = now() WHERE id = %s",
                (message, json.dumps(logs), job_id),
            )
            conn.commit()


job_manager = PostgresJobManager()
