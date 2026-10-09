"""Real OpenAI embeddings (text-embedding-3-small, 1536-dim by default -
matches settings.embedding_dimensions so the pgvector schema is uniform
regardless of which provider indexed a given repository).
"""

from __future__ import annotations

import numpy as np
import openai

from app.config import settings


class EmbeddingUnavailableError(Exception):
    pass


class OpenAIEmbeddingProvider:
    # Dense embeddings are never truly orthogonal, so completely
    # unrelated text still scores positive (empirically ~0.05-0.12 on
    # this codebase's fixtures) while genuinely relevant matches scored
    # ~0.33-0.55 - this sits in the gap between them.
    min_relevance = 0.2

    def __init__(self):
        self._client = openai.OpenAI(api_key=settings.openai_api_key)

    def embed_documents(self, texts: list[str]) -> list[np.ndarray]:
        if not texts:
            return []
        try:
            response = self._client.embeddings.create(
                model=settings.openai_embedding_model,
                input=texts,
                dimensions=settings.embedding_dimensions,
            )
        except Exception as exc:  # noqa: BLE001 - any SDK/network/auth failure
            raise EmbeddingUnavailableError(str(exc)) from exc
        return [np.array(item.embedding, dtype=np.float32) for item in response.data]

    def embed_query(self, text: str) -> np.ndarray:
        return self.embed_documents([text])[0]
