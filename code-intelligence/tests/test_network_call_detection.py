"""Frontend fetch()/axios calls become an UnresolvedReference tagged
CALLS_API with a normalized route_key as its target_name - this is what
lets a later GraphBuilder pass match it to a backend route, possibly in
an entirely different repository (see test_multi_repo_indexing.py for
the cross-repo, end-to-end case)."""

from app.domain.models import RelationshipType
from app.parsing.javascript_parser import JavaScriptFileParser


def _calls_api_targets(source: str) -> list[str]:
    _, unresolved = JavaScriptFileParser("repo1").parse("api.js", source)
    return [ref.target_name for ref in unresolved if ref.type == RelationshipType.CALLS_API]


def test_bare_fetch_defaults_to_get():
    targets = _calls_api_targets("function loadOrders() {\n  return fetch('/orders');\n}\n")
    assert targets == ["GET /orders"]


def test_fetch_with_options_object_method():
    source = (
        "function createOrder(order) {\n"
        "  return fetch('/orders', { method: 'POST', body: JSON.stringify(order) });\n"
        "}\n"
    )
    assert _calls_api_targets(source) == ["POST /orders"]


def test_fetch_template_literal_path_param():
    source = (
        "function getOrder(id) {\n"
        "  return fetch(`/orders/${id}`);\n"
        "}\n"
    )
    assert _calls_api_targets(source) == ["GET /orders/{}"]


def test_axios_shorthand_methods():
    source = (
        "function deleteOrder(id) {\n"
        "  return axios.delete('/orders/' + id);\n"
        "}\n"
    )
    assert _calls_api_targets(source) == ["DELETE /orders/{}"]


def test_axios_get_plain_path():
    source = "function listOrders() {\n  return axios.get('/orders');\n}\n"
    assert _calls_api_targets(source) == ["GET /orders"]


def test_axios_config_object_call():
    source = (
        "function updateOrder(id, data) {\n"
        "  return axios({ method: 'put', url: '/orders/' + id, data });\n"
        "}\n"
    )
    assert _calls_api_targets(source) == ["PUT /orders/{}"]


def test_unrelated_call_is_not_treated_as_a_network_call():
    source = "function helper() {\n  return doSomethingElse('/orders');\n}\n"
    assert _calls_api_targets(source) == []
