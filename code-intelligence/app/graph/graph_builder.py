"""Resolves the unresolved name references produced by the parser into
concrete graph edges, once every file in the repository has been parsed
and its symbols added to the GraphStore.

Resolution is deliberately conservative: a reference is only turned into
an edge when it resolves to exactly one candidate symbol. Ambiguous or
unresolvable references (external libraries, dynamic dispatch, name
collisions) are dropped rather than guessed - a missing edge is honest;
a wrong one is not.
"""

from __future__ import annotations

from app.domain.models import Relationship, RelationshipType, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.parsing.api_detection.route_matching import route_key
from app.parsing.python_parser import UnresolvedReference

_KIND_ALLOWLIST: dict[RelationshipType, set[SymbolKind] | None] = {
    RelationshipType.EXTENDS: {SymbolKind.CLASS},
    RelationshipType.CALLS: {SymbolKind.FUNCTION, SymbolKind.METHOD, SymbolKind.CLASS},
    RelationshipType.USES: {SymbolKind.CLASS},
    RelationshipType.TESTS: {SymbolKind.FUNCTION, SymbolKind.METHOD, SymbolKind.CLASS},
    RelationshipType.IMPORTS: None,
}


class GraphBuilder:
    def __init__(self, store: PostgresGraphStore):
        self.store = store

    def resolve(self, repository_id: str, unresolved: list[UnresolvedReference]) -> list[Relationship]:
        relationships: dict[str, Relationship] = {}

        for ref in unresolved:
            target = self._resolve_reference(repository_id, ref)
            if target is None or target.id == ref.source_id:
                continue
            rel_id = f"rel::{ref.source_id}::{ref.type.value}::{target.id}"
            relationships[rel_id] = Relationship(
                id=rel_id,
                repository_id=repository_id,
                source_id=ref.source_id,
                target_id=target.id,
                type=ref.type,
            )

        return list(relationships.values())

    def _resolve_reference(self, repository_id: str, ref: UnresolvedReference):
        if ref.type == RelationshipType.IMPORTS:
            exact = self.store.find_by_qualified_name(repository_id, ref.target_name)
            if exact is not None:
                return exact
            simple_name = ref.target_name.rsplit(".", 1)[-1]
            candidates = self.store.find_by_simple_name(repository_id, simple_name)
            return candidates[0] if len(candidates) == 1 else None

        if ref.type == RelationshipType.TESTS:
            return self._resolve_test_target(repository_id, ref.target_name)

        if ref.type == RelationshipType.CALLS_API:
            # target_name is already a normalized route_key (see
            # route_matching.route_key) - there's no shared symbol name
            # between a frontend fetch()/axios call and the backend route
            # it targets (possibly in a different repository entirely, via
            # the multi-repo application), so matching is by HTTP
            # method + path shape rather than by name.
            return self._resolve_api_call(repository_id, ref.target_name)

        kinds = _KIND_ALLOWLIST.get(ref.type)
        candidates = self.store.find_by_simple_name(repository_id, ref.target_name, kinds=kinds)
        return candidates[0] if len(candidates) == 1 else None

    def _resolve_api_call(self, repository_id: str, target_route_key: str):
        api_symbols = self.store.find_symbols(repository_id, kind=SymbolKind.API)
        matches = [
            s for s in api_symbols
            if s.api is not None and route_key(s.api.http_method, s.api.route_path) == target_route_key
        ]
        return matches[0] if len(matches) == 1 else None

    def _resolve_test_target(self, repository_id: str, stripped_test_name: str):
        """Test names conventionally read `test_<subject>_<description...>`
        (e.g. "test_authenticate_returns_token_for_valid_credentials" tests
        `authenticate`). Try the full remainder first, then progressively
        shorter leading word-groups, and accept the first unique match."""
        words = stripped_test_name.split("_")
        kinds = _KIND_ALLOWLIST[RelationshipType.TESTS]
        for end in range(len(words), 0, -1):
            candidate_name = "_".join(words[:end])
            matches = self.store.find_by_simple_name(repository_id, candidate_name, kinds=kinds)
            if len(matches) == 1:
                return matches[0]
        return None
