import shutil
from unittest.mock import patch

import pytest

from app.graph.postgres_store import PostgresGraphStore
from app.parsing.python_parser import PythonFileParser
from app.services.indexing_service import IndexingService
from app.services.postgres_job_manager import PostgresJobManager
from app.services.postgres_manifest import PostgresManifestStore
from app.services.postgres_repository_registry import PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "repo-index-test"


@pytest.fixture
def working_repo(tmp_path, fixture_repo_path):
    dest = tmp_path / "repo"
    shutil.copytree(fixture_repo_path, dest)
    return str(dest)


@pytest.fixture(autouse=True)
def clean_repo():
    PostgresGraphStore().clear_repository(REPO_ID)
    PostgresVectorStore().clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)
    yield


@pytest.fixture
def indexing_service():
    return IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )


def test_full_index_completes_with_real_stats(indexing_service, working_repo):
    job = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.run(job.id, REPO_ID, working_repo)

    finished = indexing_service.job_manager.get(job.id)
    assert finished.status == "COMPLETED"
    assert finished.progress == 100
    assert finished.stats["files"] == 17
    assert finished.stats["symbols"] > 20
    assert finished.stats["relationships"] > 10
    assert finished.stats["chunks"] > 0
    assert finished.stats["embeddings"] == finished.stats["chunks"]


def test_reindex_with_no_changes_skips_reparsing(indexing_service, working_repo):
    job1 = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.run(job1.id, REPO_ID, working_repo)

    with patch.object(PythonFileParser, "parse", wraps=None) as mocked_parse:
        job2 = indexing_service.job_manager.create(REPO_ID, working_repo)
        indexing_service.run(job2.id, REPO_ID, working_repo)
        assert mocked_parse.call_count == 0

    finished2 = indexing_service.job_manager.get(job2.id)
    assert finished2.status == "COMPLETED"
    assert finished2.stats["symbols"] == indexing_service.job_manager.get(job1.id).stats["symbols"]


def test_reindex_after_editing_one_file_only_reparses_that_file(indexing_service, working_repo):
    job1 = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.run(job1.id, REPO_ID, working_repo)

    target = f"{working_repo}/src/services/payment_service.py"
    with open(target, "a") as fh:
        fh.write("\n\ndef newly_added_function():\n    return 1\n")

    real_parse = PythonFileParser.parse
    with patch.object(PythonFileParser, "parse", autospec=True, side_effect=real_parse) as mocked_parse:
        job2 = indexing_service.job_manager.create(REPO_ID, working_repo)
        indexing_service.run(job2.id, REPO_ID, working_repo)
        assert mocked_parse.call_count == 1
        assert mocked_parse.call_args.args[1] == "src/services/payment_service.py"

    finished2 = indexing_service.job_manager.get(job2.id)
    assert finished2.status == "COMPLETED"
    assert finished2.stats["functions"] > indexing_service.job_manager.get(job1.id).stats["functions"]


def test_deleted_file_is_removed_from_the_graph(indexing_service, working_repo):
    job1 = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.run(job1.id, REPO_ID, working_repo)

    import os

    os.remove(f"{working_repo}/tests/test_payment_service.py")

    job2 = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.run(job2.id, REPO_ID, working_repo)

    finished2 = indexing_service.job_manager.get(job2.id)
    assert finished2.status == "COMPLETED"
    assert finished2.stats["files"] == 16
    remaining = indexing_service.graph_store.find_symbols(REPO_ID)
    assert all(s.file_path != "tests/test_payment_service.py" for s in remaining)


def test_cancellation_stops_the_job(indexing_service, working_repo):
    job = indexing_service.job_manager.create(REPO_ID, working_repo)
    indexing_service.job_manager.request_cancel(job.id)
    indexing_service.run(job.id, REPO_ID, working_repo)

    finished = indexing_service.job_manager.get(job.id)
    assert finished.status == "CANCELLED"
