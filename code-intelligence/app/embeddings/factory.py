"""Picks the embedding provider: real OpenAI embeddings when a key is
configured, the local hashing-trick provider otherwise - same pattern as
the LLM answer generator (app.llm.answer_generator)."""

from __future__ import annotations

from app.config import settings
from app.embeddings.hashing import HashingEmbeddingProvider
from app.embeddings.openai_provider import OpenAIEmbeddingProvider


def get_embedding_provider():
    if settings.openai_api_key:
        return OpenAIEmbeddingProvider()
    return HashingEmbeddingProvider()
