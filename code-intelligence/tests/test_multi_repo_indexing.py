"""One application, two physical repositories ("frontend"/"backend"),
sharing one AGE graph. Proves: files from each repo land under a
distinct, prefixed namespace; re-indexing one repo never touches the
other's already-resolved relationships (the real bug the naive
"clear-then-rebuild-from-this-scan-only" approach would have caused);
and the source viewer resolves a prefixed path back to the right
on-disk checkout.
"""

import pytest

from app.graph.postgres_store import PostgresGraphStore
from app.services.indexing_service import IndexingService
from app.services.postgres_job_manager import PostgresJobManager
from app.services.postgres_manifest import PostgresManifestStore
from app.services.postgres_repository_registry import PostgresRepositoryRegistry
from app.vector.postgres_store import PostgresVectorStore

REPO_ID = "repo-multi-repo-application-test"


@pytest.fixture(autouse=True)
def clean_repo():
    PostgresGraphStore().clear_repository(REPO_ID)
    PostgresVectorStore().clear_repository(REPO_ID)
    PostgresManifestStore().clear(REPO_ID)
    PostgresRepositoryRegistry().clear(REPO_ID)
    yield


@pytest.fixture
def svc():
    return IndexingService(
        graph_store=PostgresGraphStore(),
        vector_store=PostgresVectorStore(),
        manifest_store=PostgresManifestStore(),
        job_manager=PostgresJobManager(),
        repository_registry=PostgresRepositoryRegistry(),
    )


@pytest.fixture
def frontend_repo(tmp_path):
    d = tmp_path / "frontend"
    d.mkdir()
    (d / "authService.js").write_text("export function login(username) {\n  return fetchLogin(username);\n}\n")
    return str(d)


@pytest.fixture
def backend_repo(tmp_path):
    d = tmp_path / "backend"
    d.mkdir()
    (d / "auth_service.py").write_text("class AuthService:\n    def authenticate(self, username):\n        return True\n")
    return str(d)


def _run(svc, repository_path, repo_key):
    job = svc.job_manager.create(REPO_ID, repository_path)
    svc.run(job.id, REPO_ID, repository_path, repo_key)
    finished = svc.job_manager.get(job.id)
    assert finished.status == "COMPLETED", finished.error
    return finished


def test_files_from_each_repo_are_namespaced_by_repo_key(svc, frontend_repo, backend_repo):
    _run(svc, frontend_repo, "frontend")
    _run(svc, backend_repo, "backend")

    symbols = svc.graph_store.all_symbols(REPO_ID)
    file_paths = {s.file_path for s in symbols}
    assert "frontend/authService.js" in file_paths
    assert "backend/auth_service.py" in file_paths


def test_reindexing_one_repo_preserves_the_others_relationships(svc, frontend_repo, backend_repo):
    _run(svc, frontend_repo, "frontend")
    job1_stats = _run(svc, backend_repo, "backend").stats

    # Re-index only the backend again (no changes) - the frontend's
    # symbols/relationships must still be there afterwards.
    job2_stats = _run(svc, backend_repo, "backend").stats

    assert job2_stats["symbols"] == job1_stats["symbols"]
    file_paths = {s.file_path for s in svc.graph_store.all_symbols(REPO_ID)}
    assert "frontend/authService.js" in file_paths, "frontend symbols were wiped by re-indexing only the backend"


def test_stats_are_cumulative_across_repos(svc, frontend_repo, backend_repo):
    frontend_stats = _run(svc, frontend_repo, "frontend").stats
    combined_stats = _run(svc, backend_repo, "backend").stats

    assert combined_stats["files"] == frontend_stats["files"] + 1  # + backend's one file
    assert combined_stats["languages"]["javascript"] == 1
    assert combined_stats["languages"]["python"] == 1


def test_source_viewer_resolves_prefixed_path_to_the_right_checkout(svc, frontend_repo, backend_repo):
    _run(svc, frontend_repo, "frontend")
    _run(svc, backend_repo, "backend")

    registry = svc.repository_registry
    registered = registry.list_repo_keys(REPO_ID)
    assert set(registered) == {"frontend", "backend"}
    assert registry.get_path(REPO_ID, "frontend") == frontend_repo
    assert registry.get_path(REPO_ID, "backend") == backend_repo


@pytest.fixture
def api_frontend_repo(tmp_path):
    d = tmp_path / "frontend"
    d.mkdir()
    (d / "ordersClient.js").write_text(
        "export function fetchOrder(id) {\n"
        "  return fetch(`/orders/${id}`);\n"
        "}\n\n"
        "export function createOrder(order) {\n"
        "  return axios.post('/orders', order);\n"
        "}\n"
    )
    return str(d)


@pytest.fixture
def api_backend_repo(tmp_path):
    d = tmp_path / "backend"
    d.mkdir()
    (d / "app.py").write_text(
        "@app.get('/orders/<id>')\n"
        "def get_order(id):\n"
        "    return db.find(id)\n\n"
        "@app.post('/orders')\n"
        "def create_order():\n"
        "    return db.insert(request.json)\n"
    )
    return str(d)


def test_cross_repo_api_call_resolves_to_backend_route(svc, api_frontend_repo, api_backend_repo):
    """The real point of this feature: a frontend fetch()/axios call in
    one repository resolves to the backend route that actually defines
    it in a *different* repository of the same application - there's no
    shared symbol name across that network boundary, only matching HTTP
    method + path shape (see app.parsing.api_detection.route_matching)."""
    _run(svc, api_backend_repo, "backend")
    _run(svc, api_frontend_repo, "frontend")

    from app.domain.models import RelationshipType, SymbolKind

    symbols = svc.graph_store.all_symbols(REPO_ID)
    fetch_order = next(s for s in symbols if s.name == "fetchOrder")
    create_order = next(s for s in symbols if s.name == "createOrder")
    get_order_route = next(s for s in symbols if s.name == "get_order")
    create_order_route = next(s for s in symbols if s.name == "create_order")
    assert get_order_route.kind == SymbolKind.API
    assert create_order_route.kind == SymbolKind.API

    calls_api = svc.graph_store.get_relationships(REPO_ID, types={RelationshipType.CALLS_API})
    edges = {(r.source_id, r.target_id) for r in calls_api}
    assert (fetch_order.id, get_order_route.id) in edges
    assert (create_order.id, create_order_route.id) in edges
