"""A user-declared API annotation is only ever trusted as fact once it's
been checked against what the parser actually detected in the code
graph. Covers the LLM-based comparison (mocked, following this suite's
existing convention for OpenAI-backed tests - see test_answer_generator.py),
its fallback to a conservative structural comparison on any LLM failure,
and the fully-deterministic structural path used when no key is
configured at all."""

import json
from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.domain.api_models import ApiEndpointInfo
from app.domain.models import Symbol, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.services.api_annotation_verification import ApiAnnotationVerifier
from app.services.manual_api_annotations import ManualApiAnnotation

REPO_ID = "repo-api-annotation-verification-test"


@pytest.fixture
def without_openai_key():
    original = settings.openai_api_key
    settings.openai_api_key = None
    yield
    settings.openai_api_key = original


@pytest.fixture
def with_openai_key():
    original = settings.openai_api_key
    settings.openai_api_key = "sk-test-key"
    yield
    settings.openai_api_key = original


@pytest.fixture(autouse=True)
def clean_repo():
    PostgresGraphStore().clear_repository(REPO_ID)
    yield


def _detected_symbol(method, path, auth_required=False):
    symbol = Symbol(
        id=f"detected-{method}-{path}",
        repository_id=REPO_ID,
        kind=SymbolKind.API,
        name="detected_handler",
        qualified_name="mod.detected_handler",
        file_path="src/routes.py",
        start_line=1,
        end_line=5,
    )
    symbol.api = ApiEndpointInfo(http_method=method, route_path=path, auth_required=auth_required, framework="fastapi")
    return symbol


def _draft(**overrides):
    defaults = dict(
        id="manual_x",
        repository_id=REPO_ID,
        name="Refund Payment",
        created_at="",
        updated_at="",
        http_method="POST",
        route_path="/payments/{id}/refund",
        auth_required=True,
    )
    defaults.update(overrides)
    return ManualApiAnnotation(**defaults)


def test_no_detected_endpoints_at_all_is_unverified(without_openai_key):
    verifier = ApiAnnotationVerifier(PostgresGraphStore())
    result = verifier.verify(REPO_ID, _draft())
    assert result.status == "unverified"


def test_structural_exact_route_match_is_confirmed(without_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("POST", "/payments/{id}/refund", auth_required=True)])

    result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft(auth_required=True))
    assert result.status == "confirmed"


def test_structural_route_match_with_auth_mismatch_is_conflicting(without_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("POST", "/payments/{id}/refund", auth_required=False)])

    result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft(auth_required=True))
    assert result.status == "conflicting"


def test_structural_no_route_match_is_unverified_not_guessed(without_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("GET", "/completely/unrelated")])

    result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft())
    assert result.status == "unverified"


def test_llm_verdict_is_used_when_a_key_is_configured(with_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("POST", "/payments/:id/refund", auth_required=True)])

    mock_response = MagicMock()
    mock_response.choices = [
        MagicMock(message=MagicMock(content=json.dumps({"status": "confirmed", "notes": "Same route, different param syntax."})))
    ]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client):
        result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft(auth_required=True))

    assert result.status == "confirmed"
    assert result.notes == "Same route, different param syntax."


def test_llm_failure_falls_back_to_structural_comparison(with_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("POST", "/payments/{id}/refund", auth_required=True)])

    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("connection refused")

    with patch("openai.OpenAI", return_value=mock_client):
        result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft(auth_required=True))

    # Falls back to the exact structural match rather than leaving the
    # annotation's verification status unresolved just because the LLM
    # call itself failed.
    assert result.status == "confirmed"


def test_llm_returning_malformed_json_falls_back_to_structural_comparison(with_openai_key):
    store = PostgresGraphStore()
    store.add_symbols(REPO_ID, [_detected_symbol("GET", "/nothing/related")])

    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="not json at all"))]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client):
        result = ApiAnnotationVerifier(store).verify(REPO_ID, _draft())

    assert result.status == "unverified"  # never guesses "conflicting" on a parse failure
