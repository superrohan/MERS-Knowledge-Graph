"""Reproduces and fixes a real bug: the default (no-search) graph view
ranks nodes purely by connection count, so API endpoints - which are
often *low*-degree (nothing else in the codebase calls an HTTP entry
point) - got silently excluded from the default view in any repository
with more well-connected internal symbols than the node budget."""

from fastapi.testclient import TestClient

from app.config import settings
from app.domain.api_models import ApiEndpointInfo
from app.domain.models import Relationship, RelationshipType, Symbol, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.main import app

REPO_ID = "repo-graph-endpoint-api-visibility-test"
client = TestClient(app)
HEADERS = {"X-Internal-Secret": settings.internal_service_secret}


def _make_symbol(id_, kind, name):
    return Symbol(
        id=id_, repository_id=REPO_ID, kind=kind, name=name,
        qualified_name=f"mod.{name}", file_path="mod.py", start_line=1, end_line=1,
    )


def build_repo_with_one_low_degree_api_among_many_hub_functions():
    store = PostgresGraphStore()
    store.clear_repository(REPO_ID)

    # One hub function everything calls (high degree) ...
    hub = _make_symbol("hub", SymbolKind.FUNCTION, "hub")
    leaves = [_make_symbol(f"leaf{i}", SymbolKind.FUNCTION, f"leaf{i}") for i in range(30)]
    api = _make_symbol("api1", SymbolKind.API, "create_payment")
    api.api = ApiEndpointInfo(http_method="POST", route_path="/payments", auth_required=True)

    store.add_symbols(REPO_ID, [hub, *leaves, api])
    # hub <-> every leaf: hub ends up with degree 60, the API endpoint has 0.
    store.add_relationships(
        REPO_ID,
        [Relationship(id=f"r{i}", repository_id=REPO_ID, source_id="hub", target_id=f"leaf{i}", type=RelationshipType.CALLS) for i in range(30)],
    )
    return store


def test_default_graph_view_includes_api_nodes_despite_low_degree():
    build_repo_with_one_low_degree_api_among_many_hub_functions()

    res = client.get(f"/internal/repositories/{REPO_ID}/graph", params={"limit": 10}, headers=HEADERS)
    assert res.status_code == 200
    kinds = {n["kind"] for n in res.json()["nodes"]}
    assert "API" in kinds, "the zero-degree API node was pushed out of a small, degree-ranked default view"
