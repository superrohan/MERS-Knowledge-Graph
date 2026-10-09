"""A real, local, fixed-dimension embedding provider (the "hashing
trick" / feature hashing, Weinberger et al. 2009) - the no-API-key
fallback.

Unlike the old TF-IDF provider, this needs no corpus-wide fit: every
chunk (and every query) is embedded independently into the same fixed
1536-dim space, which is what makes storing chunks from many
repositories in one pgvector column with one schema possible, and what
makes embeddings genuinely incremental (an unchanged chunk's vector
never needs to be recomputed, let alone the whole repository's).
"""

from __future__ import annotations

import hashlib

import numpy as np

from app.config import settings
from app.embeddings.tokenize import tokenize


def _token_hash(token: str, seed: int) -> int:
    digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8, person=str(seed).encode()).digest()
    return int.from_bytes(digest, "big")


class HashingEmbeddingProvider:
    # Unrelated hashed vectors naturally land at/near zero (sparse,
    # disjoint buckets), so no extra floor is needed - see
    # OpenAIEmbeddingProvider for why dense embeddings need one.
    min_relevance = 0.0

    def __init__(self, dimensions: int | None = None):
        self.dimensions = dimensions or settings.embedding_dimensions

    def embed_documents(self, texts: list[str]) -> list[np.ndarray]:
        return [self.embed_query(text) for text in texts]

    def embed_query(self, text: str) -> np.ndarray:
        vector = np.zeros(self.dimensions, dtype=np.float32)
        tokens = tokenize(text)
        if not tokens:
            return vector
        for token in tokens:
            bucket = _token_hash(token, seed=1) % self.dimensions
            sign = 1.0 if _token_hash(token, seed=2) % 2 == 0 else -1.0
            vector[bucket] += sign
        norm = np.linalg.norm(vector)
        return vector / norm if norm > 0 else vector
