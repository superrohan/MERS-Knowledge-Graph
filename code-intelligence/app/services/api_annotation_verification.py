"""Cross-checks a user-declared API annotation against what the parser
actually detected in the code graph, so a declaration is only trusted as
fact once it's been confirmed - and is otherwise flagged rather than
silently believed.

Comparison is always grounded in real data: the set of parser-detected
SymbolKind.API nodes (framework != "manual") already in the graph for
this application. An exact string match on method+path isn't reliable
enough on its own (the same route can be written "{id}" vs ":id" vs
"<id>", or a user might describe it slightly differently), so this uses
the LLM's judgment to decide when an OpenAI key is configured. Without
one - or if the LLM call fails for any reason - it falls back to a
conservative, purely structural comparison: it will confirm an exact
normalized-route match, but it will never guess "conflicting" without
semantic judgment - an indeterminate case is reported "unverified", not
fabricated.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass

from app.config import settings
from app.domain.models import Symbol, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.parsing.api_detection.route_matching import route_key

logger = logging.getLogger(__name__)

_VALID_STATUSES = {"confirmed", "conflicting", "no_match"}

_VERIFY_SYSTEM_PROMPT = (
    "You are a precise verification assistant checking a user's claim about an API endpoint against "
    "what was actually found by parsing the codebase. Respond with strict JSON only - no prose, no "
    "markdown fences - matching exactly: "
    '{"status": "confirmed" | "conflicting" | "no_match", "notes": "<one or two sentence explanation>"}.\n'
    '- "confirmed": the declaration matches a detected endpoint (same route/method - route paths may be '
    "written slightly differently, e.g. {id} vs :id vs <id>, and should still be considered the same "
    "endpoint - and any auth/role details given are consistent with what was detected).\n"
    '- "conflicting": a detected endpoint clearly corresponds to the same route, but at least one '
    "declared detail (method, auth requirement, mechanism, or roles) contradicts what was detected.\n"
    '- "no_match": no detected endpoint corresponds to this declared route at all.'
)


@dataclass
class VerificationResult:
    status: str  # "confirmed" | "conflicting" | "no_match" | "unverified"
    notes: str | None


class ApiAnnotationVerifier:
    def __init__(self, graph_store: PostgresGraphStore):
        self.graph_store = graph_store

    def verify(self, repository_id: str, annotation) -> VerificationResult:
        detected = self._detected_endpoints(repository_id)
        if not detected:
            return VerificationResult(
                "unverified",
                "No parser-detected API endpoints exist yet for this application to compare against "
                "(index the repository, then re-check).",
            )

        if settings.openai_api_key:
            return self._verify_with_llm(annotation, detected)
        return self._verify_structurally(annotation, detected)

    def _detected_endpoints(self, repository_id: str) -> list[Symbol]:
        return [
            s
            for s in self.graph_store.find_symbols(repository_id, kind=SymbolKind.API)
            if s.api is not None and s.api.framework != "manual"
        ]

    def _verify_structurally(self, annotation, detected: list[Symbol]) -> VerificationResult:
        target_key = route_key(annotation.http_method, annotation.route_path)
        for symbol in detected:
            if route_key(symbol.api.http_method, symbol.api.route_path) == target_key:
                if bool(symbol.api.auth_required) != bool(annotation.auth_required):
                    return VerificationResult(
                        "conflicting",
                        f"The code shows auth_required={symbol.api.auth_required} for {target_key} "
                        f"(in {symbol.file_path}), but this declaration says "
                        f"auth_required={annotation.auth_required}.",
                    )
                return VerificationResult(
                    "confirmed", f"Matches the endpoint detected at {symbol.file_path} ({target_key})."
                )
        return VerificationResult(
            "unverified",
            "No detected endpoint has an exactly matching method+path. Set OPENAI_API_KEY for a semantic "
            "comparison that can recognize equivalent routes written differently.",
        )

    def _verify_with_llm(self, annotation, detected: list[Symbol]) -> VerificationResult:
        try:
            import openai
        except ImportError:
            return self._verify_structurally(annotation, detected)

        declared = {
            "name": annotation.name,
            "http_method": annotation.http_method,
            "route_path": annotation.route_path,
            "auth_required": annotation.auth_required,
            "auth_mechanism": annotation.auth_mechanism,
            "required_roles": annotation.required_roles,
            "reference_path": annotation.reference_path,
        }
        candidates = [
            {
                "name": s.name,
                "http_method": s.api.http_method,
                "route_path": s.api.route_path,
                "auth_required": s.api.auth_required,
                "auth_mechanism": s.api.auth_mechanism,
                "required_roles": s.api.required_roles,
                "framework": s.api.framework,
                "file_path": s.file_path,
            }
            for s in detected
        ]
        user_prompt = (
            f"User-declared endpoint:\n{json.dumps(declared, indent=2)}\n\n"
            f"Endpoints actually detected by parsing the code:\n{json.dumps(candidates, indent=2)}"
        )

        try:
            client = openai.OpenAI(api_key=settings.openai_api_key)
            response = client.chat.completions.create(
                model=settings.openai_model,
                max_completion_tokens=300,
                messages=[
                    {"role": "system", "content": _VERIFY_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
            )
            text = (response.choices[0].message.content or "").strip()
            if text.startswith("```"):
                text = text.strip("`")
                if text.lower().startswith("json"):
                    text = text[4:]
            parsed = json.loads(text)
            status = parsed.get("status")
            if status not in _VALID_STATUSES:
                raise ValueError(f"Unexpected verification status from LLM: {status!r}")
            return VerificationResult(status, parsed.get("notes"))
        except Exception:
            logger.exception("LLM-based annotation verification failed; falling back to structural comparison")
            return self._verify_structurally(annotation, detected)
