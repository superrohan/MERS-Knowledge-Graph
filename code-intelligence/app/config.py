"""Centralized configuration for the Python code-intelligence service.

This service is internal-only: it is never reached directly by the React
frontend. Node.js is the only caller, and it must present the shared
secret configured here via the ``X-Internal-Secret`` header.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="", env_file=".env", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8000
    environment: str = "development"

    # Must match INTERNAL_SERVICE_SECRET configured on the Node.js backend.
    internal_service_secret: str = "dev-internal-secret-change-me"

    # Where cloned repositories are staged for indexing.
    workspace_root: str = "/tmp/code-intelligence-workspaces"

    # LLM / embeddings (optional; see app/llm and app/embeddings providers).
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    # Postgres (Apache AGE for the graph, pgvector for embeddings, plain
    # tables for everything else - see docker-compose.yml / docker/init.sql).
    database_url: str = "postgresql://code_intelligence:code_intelligence@127.0.0.1:5433/code_intelligence"


settings = Settings()
