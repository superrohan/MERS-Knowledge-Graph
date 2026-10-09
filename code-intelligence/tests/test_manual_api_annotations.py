"""User-declared API annotations: stored directly (never fabricated),
materialized into the graph as ordinary SymbolKind.API nodes so they
show up in the graph view/query citations exactly like a parser-detected
endpoint, and never touched by a real repository re-index since they
live under a synthetic __manual__/ file_path."""

from fastapi.testclient import TestClient

from app.config import settings
from app.domain.models import SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.main import app
from app.services.manual_api_annotations import ManualApiAnnotationService

REPO_ID = "repo-manual-api-annotations-test"
client = TestClient(app)
HEADERS = {"X-Internal-Secret": settings.internal_service_secret}


def _clean():
    PostgresGraphStore().clear_repository(REPO_ID)
    with_conn_cleanup()


def with_conn_cleanup():
    from app.db.connection import get_connection

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM manual_api_annotations WHERE repository_id = %s", (REPO_ID,))
        conn.commit()


def setup_function(_):
    _clean()


def test_create_materializes_an_api_symbol_in_the_graph():
    service = ManualApiAnnotationService(graph_store=PostgresGraphStore())
    annotation = service.create(
        REPO_ID,
        name="Delete Account",
        http_method="DELETE",
        route_path="/api/accounts/{id}",
        auth_required=True,
        auth_mechanism="jwt",
        required_roles=["admin"],
        notes="Exposed via the API gateway, not visible to the parser.",
    )

    symbols = PostgresGraphStore().all_symbols(REPO_ID)
    api_symbols = [s for s in symbols if s.kind == SymbolKind.API]
    assert len(api_symbols) == 1
    api = api_symbols[0]
    assert api.name == "Delete Account"
    assert api.api.http_method == "DELETE"
    assert api.api.route_path == "/api/accounts/{id}"
    assert api.api.auth_required is True
    assert api.api.required_roles == ["admin"]
    assert api.api.framework == "manual"
    assert api.file_path.startswith("__manual__/")
    assert annotation.notes in api.docstring


def test_update_replaces_the_materialized_symbol_rather_than_duplicating_it():
    service = ManualApiAnnotationService(graph_store=PostgresGraphStore())
    annotation = service.create(REPO_ID, name="Old Name", http_method="GET", route_path="/old")

    service.update(REPO_ID, annotation.id, name="New Name", http_method="GET", route_path="/new")

    symbols = [s for s in PostgresGraphStore().all_symbols(REPO_ID) if s.kind == SymbolKind.API]
    assert len(symbols) == 1
    assert symbols[0].name == "New Name"
    assert symbols[0].api.route_path == "/new"


def test_delete_removes_both_the_row_and_the_graph_node():
    service = ManualApiAnnotationService(graph_store=PostgresGraphStore())
    annotation = service.create(REPO_ID, name="Temp", http_method="GET", route_path="/temp")

    deleted = service.delete(REPO_ID, annotation.id)

    assert deleted is True
    assert service.list(REPO_ID) == []
    assert [s for s in PostgresGraphStore().all_symbols(REPO_ID) if s.kind == SymbolKind.API] == []


def test_manual_annotation_survives_a_real_files_remove_file_call():
    """The core guarantee: re-indexing a real scanned file must never
    collaterally delete a user's manual annotation, because it lives
    under a synthetic file_path a real scan never produces."""
    store = PostgresGraphStore()
    service = ManualApiAnnotationService(graph_store=store)
    service.create(REPO_ID, name="Gateway Endpoint", http_method="POST", route_path="/gateway/ingest")

    store.remove_file(REPO_ID, "src/routes/orders.py")  # simulates a real file being re-scanned

    symbols = [s for s in store.all_symbols(REPO_ID) if s.kind == SymbolKind.API]
    assert len(symbols) == 1
    assert symbols[0].name == "Gateway Endpoint"


def test_api_endpoints_full_crud_round_trip():
    create_res = client.post(
        f"/internal/repositories/{REPO_ID}/api-annotations",
        json={"name": "Refund Payment", "http_method": "POST", "route_path": "/payments/{id}/refund", "auth_required": True},
        headers=HEADERS,
    )
    assert create_res.status_code == 201
    annotation_id = create_res.json()["id"]
    assert create_res.json()["httpMethod"] == "POST"

    list_res = client.get(f"/internal/repositories/{REPO_ID}/api-annotations", headers=HEADERS)
    assert list_res.status_code == 200
    assert len(list_res.json()) == 1

    update_res = client.put(
        f"/internal/repositories/{REPO_ID}/api-annotations/{annotation_id}",
        json={"name": "Refund Payment", "http_method": "POST", "route_path": "/payments/{id}/refund", "notes": "Idempotent."},
        headers=HEADERS,
    )
    assert update_res.status_code == 200
    assert update_res.json()["notes"] == "Idempotent."

    delete_res = client.delete(f"/internal/repositories/{REPO_ID}/api-annotations/{annotation_id}", headers=HEADERS)
    assert delete_res.status_code == 200
    assert client.get(f"/internal/repositories/{REPO_ID}/api-annotations", headers=HEADERS).json() == []


def test_updating_an_unknown_annotation_404s():
    res = client.put(
        f"/internal/repositories/{REPO_ID}/api-annotations/does-not-exist",
        json={"name": "X"},
        headers=HEADERS,
    )
    assert res.status_code == 404


def test_endpoints_require_the_internal_secret():
    res = client.get(f"/internal/repositories/{REPO_ID}/api-annotations")
    assert res.status_code in (401, 403)
