"""End-to-end proof that a genuinely polyglot repository indexes
correctly: each language's files are parsed by the right parser, same-
language cross-file calls resolve, and same-named symbols in different
languages never get wrongly cross-wired (GraphBuilder only resolves a
reference when exactly one candidate matches - a same-named symbol in
another language is a second candidate, so no edge is created; better a
missing edge than a fabricated cross-language one).
"""

import pytest

from app.domain.models import RelationshipType
from app.graph.postgres_store import PostgresGraphStore
from app.services.indexing_service import IndexingService
from app.services.postgres_job_manager import PostgresJobManager
from app.services.postgres_manifest import PostgresManifestStore
from app.services.postgres_repository_registry import PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "repo-multi-language-test"


@pytest.fixture(autouse=True)
def clean_repo():
    PostgresGraphStore().clear_repository(REPO_ID)
    PostgresVectorStore().clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)
    yield


@pytest.fixture
def polyglot_repo(tmp_path):
    (tmp_path / "backend").mkdir()
    (tmp_path / "backend" / "auth_service.py").write_text(
        "class AuthService:\n"
        "    def authenticate(self, username):\n"
        "        return self.repository.find(username)\n"
    )

    (tmp_path / "frontend").mkdir()
    (tmp_path / "frontend" / "authService.js").write_text(
        "export class AuthService {\n"
        "  authenticate(username) {\n"  # same name as the Python method below, on purpose
        "    return apiClient.post('/login', { username });\n"
        "  }\n\n"
        "  validateCredentials(username) {\n"  # JS-only name, unambiguous cross-file target
        "    return username.length > 0;\n"
        "  }\n"
        "}\n"
    )
    (tmp_path / "frontend" / "loginForm.js").write_text(
        "import { AuthService } from './authService.js';\n\n"
        "function handleSubmit(username) {\n"
        "  const service = new AuthService();\n"
        "  return service.validateCredentials(username);\n"
        "}\n"
    )

    (tmp_path / "tools").mkdir()
    (tmp_path / "tools" / "Validator.java").write_text(
        "package com.example.tools;\n\n"
        "public class Validator {\n"
        "    public boolean validate(String input) {\n"
        "        return helper(input);\n"
        "    }\n"
        "}\n"
    )

    return str(tmp_path)


def test_indexes_all_three_languages_in_one_run(polyglot_repo):
    svc = IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )
    job = svc.job_manager.create(REPO_ID, polyglot_repo)
    svc.run(job.id, REPO_ID, polyglot_repo)

    finished = svc.job_manager.get(job.id)
    assert finished.status == "COMPLETED", finished.error
    assert finished.stats["languages"] == {"python": 1, "javascript": 2, "java": 1}


def test_javascript_cross_file_call_resolves_within_javascript(polyglot_repo):
    svc = IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )
    job = svc.job_manager.create(REPO_ID, polyglot_repo)
    svc.run(job.id, REPO_ID, polyglot_repo)
    assert svc.job_manager.get(job.id).status == "COMPLETED"

    store = svc.graph_store
    handle_submit = store.find_by_qualified_name(REPO_ID, "frontend.loginForm.handleSubmit")
    validate_credentials = store.find_by_qualified_name(
        REPO_ID, "frontend.authService.AuthService.validateCredentials"
    )
    assert handle_submit is not None
    assert validate_credentials is not None

    calls = store.get_relationships(REPO_ID, source_id=handle_submit.id, types={RelationshipType.CALLS})
    assert validate_credentials.id in {rel.target_id for rel in calls}


def test_same_named_methods_across_languages_are_not_cross_wired(polyglot_repo):
    """Both Python's AuthService.authenticate and JS's AuthService.authenticate
    exist; nothing in either language calls across that boundary, and the
    parser/resolver must not invent a link just because the names match."""
    svc = IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )
    job = svc.job_manager.create(REPO_ID, polyglot_repo)
    svc.run(job.id, REPO_ID, polyglot_repo)
    assert svc.job_manager.get(job.id).status == "COMPLETED"

    store = svc.graph_store
    python_authenticate = store.find_by_qualified_name(REPO_ID, "backend.auth_service.AuthService.authenticate")
    js_authenticate = store.find_by_qualified_name(REPO_ID, "frontend.authService.AuthService.authenticate")
    assert python_authenticate is not None
    assert js_authenticate is not None

    # Neither has any relationship pointing at the other.
    python_rels = store.get_relationships(REPO_ID, source_id=python_authenticate.id)
    python_rels += store.get_relationships(REPO_ID, target_id=python_authenticate.id)
    assert all(r.source_id != js_authenticate.id and r.target_id != js_authenticate.id for r in python_rels)
