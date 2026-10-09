from fastapi import FastAPI

from app.api.health import router as health_router
from app.api.indexing import router as indexing_router
from app.api.manual_api_annotations import router as manual_api_annotations_router
from app.api.query import router as query_router
from app.api.repositories import router as repositories_router
from app.config import settings

app = FastAPI(
    title="Code Intelligence Service",
    description=(
        "Internal-only service: code ingestion, parsing, knowledge-graph "
        "construction, embeddings, and GraphRAG query. Reachable only from "
        "the Node.js application API, never from the browser."
    ),
    version="0.1.0",
    docs_url="/docs" if settings.environment != "production" else None,
)

app.include_router(health_router)
app.include_router(indexing_router)
app.include_router(query_router)
app.include_router(repositories_router)
app.include_router(manual_api_annotations_router)
