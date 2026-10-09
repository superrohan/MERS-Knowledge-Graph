from unittest.mock import MagicMock, patch

import pytest

from app.config import settings
from app.llm.answer_generator import AnswerGenerator, LLMUnavailableError
from app.retrieval.hybrid_retriever import RetrievalResult


def _retrieval_with_one_citation():
    return RetrievalResult(
        query_type="hybrid",
        citations=[{"filePath": "src/services/auth_service.py", "startLine": 31, "endLine": 72, "symbolName": "AuthService.authenticate"}],
        graph_path=[{"source": "LoginController.login", "relationship": "CALLS", "target": "AuthService.authenticate"}],
    )


@pytest.fixture
def with_openai_key():
    original = settings.openai_api_key
    settings.openai_api_key = "sk-test-key"
    yield
    settings.openai_api_key = original


@pytest.fixture
def without_openai_key():
    original = settings.openai_api_key
    settings.openai_api_key = None
    yield
    settings.openai_api_key = original


def test_uses_openai_when_a_key_is_configured(with_openai_key):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="AuthService handles it."))]

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    with patch("openai.OpenAI", return_value=mock_client) as mock_openai_cls:
        result = AnswerGenerator().generate("How does auth work?", _retrieval_with_one_citation())

    mock_openai_cls.assert_called_once_with(api_key="sk-test-key")
    call_kwargs = mock_client.chat.completions.create.call_args.kwargs
    assert call_kwargs["model"] == settings.openai_model
    assert call_kwargs["messages"][0]["role"] == "system"
    assert "How does auth work?" in call_kwargs["messages"][1]["content"]
    assert result == {"answer": "AuthService handles it.", "basis": "FACT"}


def test_raises_llm_unavailable_when_openai_call_fails(with_openai_key):
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("connection refused")

    with patch("openai.OpenAI", return_value=mock_client):
        with pytest.raises(LLMUnavailableError):
            AnswerGenerator().generate("How does auth work?", _retrieval_with_one_citation())


def test_falls_back_to_template_when_no_key_is_configured(without_openai_key):
    result = AnswerGenerator().generate("How does auth work?", _retrieval_with_one_citation())
    assert result["basis"] == "FACT"
    assert "AuthService.authenticate" in result["answer"]


def test_returns_uncertain_basis_without_citations():
    result = AnswerGenerator().generate("nonsense query", RetrievalResult(query_type="hybrid"))
    assert result["basis"] == "UNCERTAIN"


def _api_citation(**overrides):
    api = {
        "httpMethod": "GET",
        "routePath": "/orders",
        "authRequired": True,
        "authMechanism": "jwt",
        "requiredRoles": ["admin"],
        "requestParams": [
            {"name": "status", "location": "query", "required": False, "type": "str", "source": "declared"},
        ],
        "framework": "fastapi",
        "middlewareChain": [
            {"name": "Depends(get_current_user)", "kind": "dependency", "detail": "requires authentication (dependency)"},
        ],
        "verificationStatus": None,
        "verificationNotes": None,
    }
    api.update(overrides)
    return {
        "filePath": "src/routes/orders.py",
        "startLine": 10,
        "endLine": 20,
        "symbolId": "s1",
        "symbolName": "list_orders",
        "relevance": 0.5,
        "api": api,
    }


def test_template_answer_lists_query_params_and_middleware_chain(without_openai_key):
    retrieval = RetrievalResult(query_type="hybrid", citations=[_api_citation()])
    result = AnswerGenerator().generate("What filtering does the orders endpoint support?", retrieval)

    assert "status" in result["answer"]
    assert "Depends(get_current_user)" in result["answer"]
    assert "requires authentication (dependency)" in result["answer"]


def test_template_answer_flags_observed_params_with_an_asterisk(without_openai_key):
    citation = _api_citation()
    citation["api"]["requestParams"][0]["source"] = "observed"
    retrieval = RetrievalResult(query_type="hybrid", citations=[citation])
    result = AnswerGenerator().generate("What params does this take?", retrieval)

    assert "status*" in result["answer"]
    assert "found by scanning the handler body" in result["answer"]


def test_evidence_sent_to_llm_includes_params_and_middleware_chain(with_openai_key):
    mock_response = MagicMock()
    mock_response.choices = [MagicMock(message=MagicMock(content="answer"))]
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = mock_response

    retrieval = RetrievalResult(query_type="hybrid", citations=[_api_citation()])
    with patch("openai.OpenAI", return_value=mock_client):
        AnswerGenerator().generate("How does auth work here?", retrieval)

    evidence_text = mock_client.chat.completions.create.call_args.kwargs["messages"][1]["content"]
    assert "status (query, declared, required=False)" in evidence_text
    assert "Depends(get_current_user)" in evidence_text
    assert "requires authentication (dependency)" in evidence_text
