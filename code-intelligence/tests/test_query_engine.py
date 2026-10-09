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

REPO_ID = "repo-query-test"


@pytest.fixture
def indexed_repo(tmp_path, fixture_repo_path):
    dest = tmp_path / "repo"
    shutil.copytree(fixture_repo_path, dest)

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
    job = indexing_service.job_manager.create(REPO_ID, str(dest))
    indexing_service.run(job.id, REPO_ID, str(dest))
    assert indexing_service.job_manager.get(job.id).status == "COMPLETED"

    query_engine = QueryEngine(
        hybrid_retriever=HybridRetriever(
            graph_store=graph_store,
            vector_retriever=VectorRetriever(vector_store),
            graph_retriever=GraphRetriever(graph_store),
        ),
        answer_generator=AnswerGenerator(),
    )
    return query_engine


def test_authentication_question_surfaces_auth_service_with_citations(indexed_repo):
    response = indexed_repo.query(REPO_ID, "How does authentication work in this application?")

    assert response["citations"], "expected at least one citation"
    cited_files = {c["filePath"] for c in response["citations"]}
    assert "src/services/auth_service.py" in cited_files
    assert response["metadata"]["symbolsRetrieved"] > 0
    assert response["basis"] == "FACT"


def test_what_calls_payment_service_uses_incoming_direction(indexed_repo):
    response = indexed_repo.query(REPO_ID, "What calls PaymentService?")

    graph_targets = {hop["target"] for hop in response["graphPath"]}
    assert any("PaymentService" in t for t in graph_targets) or any(
        "PaymentService" in hop["source"] for hop in response["graphPath"]
    )


def test_where_is_jwt_validation_implemented(indexed_repo):
    response = indexed_repo.query(REPO_ID, "Where is JWT validation implemented?")

    cited_files = {c["filePath"] for c in response["citations"]}
    assert "src/security/jwt.py" in cited_files


def test_unrelated_query_returns_uncertain_basis_not_a_fabricated_answer(indexed_repo):
    response = indexed_repo.query(REPO_ID, "zzz nonexistent quux flibbertigibbet")

    assert response["citations"] == []
    assert response["basis"] == "UNCERTAIN"
    assert "couldn't find" in response["answer"].lower()


def test_query_response_never_includes_full_source_dump(indexed_repo):
    response = indexed_repo.query(REPO_ID, "How does authentication work?")
    # Citations point at line ranges; they must not embed the file contents.
    for citation in response["citations"]:
        assert "text" not in citation
        assert "content" not in citation
