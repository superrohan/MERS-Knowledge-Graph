"""Wires the process-wide singletons together. One place to see how the
pipeline fits, instead of scattering construction across route files."""

from __future__ import annotations

from app.graph.postgres_store import graph_store
from app.llm.answer_generator import answer_generator
from app.query.engine import QueryEngine
from app.retrieval.graph_retriever import GraphRetriever
from app.retrieval.hybrid_retriever import HybridRetriever
from app.retrieval.vector_retriever import VectorRetriever
from app.services.indexing_service import IndexingService
from app.services.manual_api_annotations import ManualApiAnnotationService
from app.services.postgres_job_manager import job_manager
from app.services.postgres_manifest import manifest_store
from app.services.postgres_repository_registry import repository_registry
from app.vector.postgres_store import vector_store

indexing_service = IndexingService(
    graph_store=graph_store,
    vector_store=vector_store,
    manifest_store=manifest_store,
    job_manager=job_manager,
    repository_registry=repository_registry,
)

query_engine = QueryEngine(
    hybrid_retriever=HybridRetriever(
        graph_store=graph_store,
        vector_retriever=VectorRetriever(vector_store),
        graph_retriever=GraphRetriever(graph_store),
    ),
    answer_generator=answer_generator,
)

manual_api_annotation_service = ManualApiAnnotationService(graph_store=graph_store)

__all__ = [
    "indexing_service",
    "query_engine",
    "graph_store",
    "vector_store",
    "job_manager",
    "repository_registry",
    "manual_api_annotation_service",
]
