"""End-to-end proof that extracted API/auth metadata actually reaches
query answers - the point of the whole feature, not just something that
sits in the graph unused."""

import shutil

import pytest

from app.graph.postgres_store import PostgresGraphStore
from app.llm.answer_generator import AnswerGenerator
from app.query.engine import QueryEngine
from app.retrieval.graph_retriever import GraphRetriever
from app.retrieval.hybrid_retriever import HybridRetriever
from app.retrieval.vector_retriever import VectorRetriever
from app.services.indexing_service import IndexingService
from app.services.postgres_job_manager import PostgresJobManager
from app.services.postgres_manifest import PostgresManifestStore
from app.services.postgres_repository_registry import PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "repo-api-auth-query-test"


@pytest.fixture
def query_engine(tmp_path):
    (tmp_path / "app.py").write_text(
        "@router.post('/payments')\n"
        "@requires_role('finance_admin')\n"
        "def create_payment(amount: float, current_user=Depends(get_current_user)):\n"
        "    return process(amount)\n\n"
        "@router.get('/health')\n"
        "def health_check():\n"
        "    return {'status': 'ok'}\n"
    )

    graph_store = PostgresGraphStore()
    vector_store = PostgresVectorStore()
    graph_store.clear_repository(REPO_ID)
    vector_store.clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)

    indexing_service = IndexingService(
        graph_store=graph_store,
        vector_store=vector_store,
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )
    job = indexing_service.job_manager.create(REPO_ID, str(tmp_path))
    indexing_service.run(job.id, REPO_ID, str(tmp_path))
    assert indexing_service.job_manager.get(job.id).status == "COMPLETED"

    return QueryEngine(
        hybrid_retriever=HybridRetriever(
            graph_store=graph_store,
            vector_retriever=VectorRetriever(vector_store),
            graph_retriever=GraphRetriever(graph_store),
        ),
        answer_generator=AnswerGenerator(),
    )


def test_query_surfaces_auth_requirements_for_an_endpoint(query_engine):
    response = query_engine.query(REPO_ID, "What are the authentication requirements for the payments endpoint?")

    api_citations = [c for c in response["citations"] if c.get("api")]
    assert api_citations, "expected at least one citation carrying API metadata"

    payment_citation = next(c for c in api_citations if c["api"]["routePath"] == "/payments")
    assert payment_citation["api"]["httpMethod"] == "POST"
    assert payment_citation["api"]["authRequired"] is True
    assert "finance_admin" in payment_citation["api"]["requiredRoles"]

    # The (no-key) template fallback must state this plainly, not omit it.
    assert "/payments" in response["answer"]
    assert "finance_admin" in response["answer"] or "authentication" in response["answer"].lower()


def test_health_check_endpoint_has_no_auth_requirement(query_engine):
    response = query_engine.query(REPO_ID, "Is authentication required for the health check endpoint?")

    api_citations = [c for c in response["citations"] if c.get("api")]
    health_citations = [c for c in api_citations if c["api"]["routePath"] == "/health"]
    assert health_citations
    assert health_citations[0]["api"]["authRequired"] is False
