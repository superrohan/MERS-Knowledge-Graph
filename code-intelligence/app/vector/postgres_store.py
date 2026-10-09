"""VectorStore backed by pgvector's `code_chunks` table.

Every chunk's embedding is computed independently at chunk-creation
time (see app.embeddings.factory) rather than fit over the whole
repository's corpus, so - unlike the old TF-IDF store - unchanged
chunks genuinely never need to be touched during a re-index.
"""

from __future__ import annotations

import numpy as np
from pgvector import Vector

from app.db.connection import get_connection
from app.domain.models import CodeChunk


class PostgresVectorStore:
    def clear_repository(self, repository_id: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("DELETE FROM code_chunks WHERE repository_id = %s", (repository_id,))
            conn.commit()

    def remove_file(self, repository_id: str, file_path: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM code_chunks WHERE repository_id = %s AND file_path = %s",
                (repository_id, file_path),
            )
            conn.commit()

    def add(self, repository_id: str, chunk: CodeChunk, vector: np.ndarray) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO code_chunks (id, repository_id, file_path, start_line, end_line, symbol_id, symbol_name, text, embedding)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    file_path = EXCLUDED.file_path,
                    start_line = EXCLUDED.start_line,
                    end_line = EXCLUDED.end_line,
                    symbol_id = EXCLUDED.symbol_id,
                    symbol_name = EXCLUDED.symbol_name,
                    text = EXCLUDED.text,
                    embedding = EXCLUDED.embedding
                """,
                (
                    chunk.id,
                    repository_id,
                    chunk.file_path,
                    chunk.start_line,
                    chunk.end_line,
                    chunk.symbol_id,
                    chunk.symbol_name,
                    chunk.text,
                    Vector(vector),
                ),
            )
            conn.commit()

    def count(self, repository_id: str) -> int:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT count(*) FROM code_chunks WHERE repository_id = %s", (repository_id,))
            return cur.fetchone()[0]

    def get_chunk(self, repository_id: str, chunk_id: str) -> CodeChunk | None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, file_path, start_line, end_line, symbol_id, symbol_name, text"
                " FROM code_chunks WHERE repository_id = %s AND id = %s",
                (repository_id, chunk_id),
            )
            row = cur.fetchone()
            return self._row_to_chunk(repository_id, row) if row else None

    def all_chunks(self, repository_id: str) -> list[CodeChunk]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id, file_path, start_line, end_line, symbol_id, symbol_name, text"
                " FROM code_chunks WHERE repository_id = %s",
                (repository_id,),
            )
            return [self._row_to_chunk(repository_id, row) for row in cur.fetchall()]

    def get_chunk_ids_for_file(self, repository_id: str, file_path: str) -> set[str]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM code_chunks WHERE repository_id = %s AND file_path = %s",
                (repository_id, file_path),
            )
            return {row[0] for row in cur.fetchall()}

    def search(
        self, repository_id: str, query_vector: np.ndarray, top_k: int = 8, min_score: float = 0.0
    ) -> list[tuple[CodeChunk, float]]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                SELECT id, file_path, start_line, end_line, symbol_id, symbol_name, text,
                       1 - (embedding <=> %s) AS cosine_similarity
                FROM code_chunks
                WHERE repository_id = %s
                ORDER BY embedding <=> %s
                LIMIT %s
                """,
                (Vector(query_vector), repository_id, Vector(query_vector), top_k),
            )
            results = []
            for row in cur.fetchall():
                score = float(row[-1])
                if score < min_score:
                    continue
                results.append((self._row_to_chunk(repository_id, row[:-1]), score))
            return results

    def _row_to_chunk(self, repository_id: str, row) -> CodeChunk:
        chunk_id, file_path, start_line, end_line, symbol_id, symbol_name, text = row
        return CodeChunk(
            id=chunk_id,
            repository_id=repository_id,
            file_path=file_path,
            start_line=start_line,
            end_line=end_line,
            symbol_id=symbol_id,
            symbol_name=symbol_name,
            text=text,
        )


vector_store = PostgresVectorStore()
