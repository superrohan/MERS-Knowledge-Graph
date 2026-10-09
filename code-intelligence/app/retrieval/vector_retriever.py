from __future__ import annotations

from app.domain.models import CodeChunk
from app.embeddings.factory import get_embedding_provider
from app.vector.postgres_store import PostgresVectorStore


class VectorRetriever:
    def __init__(self, vector_store: PostgresVectorStore):
        self.vector_store = vector_store

    def search(self, repository_id: str, query_text: str, top_k: int = 8) -> list[tuple[CodeChunk, float]]:
        provider = get_embedding_provider()
        query_vector = provider.embed_query(query_text)
        return self.vector_store.search(
            repository_id, query_vector, top_k=top_k, min_score=provider.min_relevance
        )
