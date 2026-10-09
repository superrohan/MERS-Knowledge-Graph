"""GraphStore backed by Apache AGE - one Cypher graph per repository_id
(repository isolation is structural, not just a filter clause).

Every Symbol is stored as a vertex whose AGE *label* is its `kind`
(CLASS, FUNCTION, ...) for cheap native filtering, with `kind` also kept
as a plain property so runtime kind-sets (e.g. "CLASS or METHOD") can be
matched without building dynamic label lists. Every Relationship is an
edge whose AGE label is its `type` (CALLS, IMPORTS, ...).

AGE's `cypher(graph_name, query, params)` function requires both
`graph_name` and the Cypher `query` text itself to be compile-time
constants - neither can be a bind parameter (AGE resolves them at parse
time to plan the query's dynamic return shape). So `graph_name` and any
label name are always interpolated directly into the SQL text via
`_quoted_literal`/`_label`, and only real data values ever go through
the query's own `$name`-style Cypher parameters, passed as one JSON blob
through a genuine psycopg bind parameter.
"""

from __future__ import annotations

import json
import re

from app.db.agtype import parse_agtype
from app.db.connection import get_connection
from app.domain.api_models import ApiEndpointInfo, MiddlewareStep, RequestParam
from app.domain.models import Relationship, RelationshipType, Symbol, SymbolKind

_SYMBOL_FIELDS = [
    "id",
    "repository_id",
    "kind",
    "name",
    "qualified_name",
    "file_path",
    "start_line",
    "end_line",
    "docstring",
    "http_method",
    "route_path",
    "auth_required",
    "auth_mechanism",
    "required_roles",
    "request_params",
    "framework",
    "middleware_chain",
    "verification_status",
    "verification_notes",
]

_LABEL_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _quoted_literal(value: str) -> str:
    """A safely-quoted SQL string literal, for the identifier-like
    positions (graph name) that AGE requires to be constant text."""
    return "'" + value.replace("'", "''") + "'"


def _label(value: str) -> str:
    """A Cypher label/relationship-type name. Only ever called with our
    own enum values (SymbolKind/RelationshipType), never repository
    content, but validated anyway since it's interpolated as raw text."""
    if not _LABEL_RE.match(value):
        raise ValueError(f"Unsafe label: {value!r}")
    return value


def _symbol_properties(symbol: Symbol) -> dict:
    props = {
        "id": symbol.id,
        "repository_id": symbol.repository_id,
        "kind": symbol.kind.value,
        "name": symbol.name,
        "qualified_name": symbol.qualified_name,
        "file_path": symbol.file_path,
        "start_line": symbol.start_line,
        "end_line": symbol.end_line,
        "docstring": symbol.docstring,
    }
    api = symbol.api
    if api is not None:
        props.update(
            {
                "http_method": api.http_method,
                "route_path": api.route_path,
                "auth_required": api.auth_required,
                "auth_mechanism": api.auth_mechanism,
                "required_roles": api.required_roles,
                "request_params": [p.__dict__ for p in api.request_params],
                "framework": api.framework,
                "middleware_chain": [m.__dict__ for m in api.middleware_chain],
                "verification_status": api.verification_status,
                "verification_notes": api.verification_notes,
            }
        )
    return props


def _symbol_from_properties(props: dict) -> Symbol:
    symbol = Symbol(
        id=props["id"],
        repository_id=props["repository_id"],
        kind=SymbolKind(props["kind"]),
        name=props["name"],
        qualified_name=props["qualified_name"],
        file_path=props["file_path"],
        start_line=props["start_line"],
        end_line=props["end_line"],
        docstring=props.get("docstring"),
    )
    if props.get("http_method") or props.get("route_path"):
        symbol.api = ApiEndpointInfo(
            http_method=props.get("http_method"),
            route_path=props.get("route_path"),
            auth_required=bool(props.get("auth_required")),
            auth_mechanism=props.get("auth_mechanism"),
            required_roles=props.get("required_roles") or [],
            request_params=[RequestParam(**p) for p in props.get("request_params") or []],
            framework=props.get("framework"),
            middleware_chain=[MiddlewareStep(**m) for m in props.get("middleware_chain") or []],
            verification_status=props.get("verification_status"),
            verification_notes=props.get("verification_notes"),
        )
    return symbol


class PostgresGraphStore:
    def _ensure_graph(self, cur, repository_id: str) -> None:
        cur.execute("SELECT 1 FROM ag_catalog.ag_graph WHERE name = %s", (repository_id,))
        if cur.fetchone() is None:
            cur.execute("SELECT create_graph(%s)", (repository_id,))

    def clear_repository(self, repository_id: str) -> None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM ag_catalog.ag_graph WHERE name = %s", (repository_id,))
            if cur.fetchone() is not None:
                cur.execute("SELECT drop_graph(%s, true)", (repository_id,))
            cur.execute("SELECT create_graph(%s)", (repository_id,))
            conn.commit()

    def remove_file(self, repository_id: str, file_path: str) -> None:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(
                f"SELECT * FROM cypher({graph}, $$ MATCH (n {{file_path: $file_path}}) DETACH DELETE n $$, %s)"
                f" AS (result agtype)",
                (json.dumps({"file_path": file_path}),),
            )
            conn.commit()

    def add_symbols(self, repository_id: str, symbols: list[Symbol]) -> None:
        if not symbols:
            return
        graph = _quoted_literal(repository_id)
        field_list = ", ".join(f"{f}: item.{f}" for f in _SYMBOL_FIELDS)

        by_kind: dict[str, list[dict]] = {}
        for symbol in symbols:
            props = {f: None for f in _SYMBOL_FIELDS}
            props.update(_symbol_properties(symbol))
            by_kind.setdefault(symbol.kind.value, []).append(props)

        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            for kind, items in by_kind.items():
                query = f"""
                    SELECT * FROM cypher({graph}, $$
                        UNWIND $items AS item
                        CREATE (n:{_label(kind)} {{{field_list}}})
                    $$, %s) AS (result agtype)
                """
                cur.execute(query, (json.dumps({"items": items}),))
            conn.commit()

    def clear_relationships_by_types(self, repository_id: str, types: set) -> None:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            for rel_type in types:
                cur.execute(
                    f"SELECT * FROM cypher({graph}, $$ MATCH ()-[r:{_label(rel_type.value)}]->() DELETE r $$)"
                    f" AS (result agtype)"
                )
            conn.commit()

    def add_relationships(self, repository_id: str, relationships: list[Relationship]) -> None:
        if not relationships:
            return
        graph = _quoted_literal(repository_id)

        by_type: dict[str, list[dict]] = {}
        for rel in relationships:
            by_type.setdefault(rel.type.value, []).append(
                {"id": rel.id, "source_id": rel.source_id, "target_id": rel.target_id}
            )

        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            for rel_type, items in by_type.items():
                query = f"""
                    SELECT * FROM cypher({graph}, $$
                        UNWIND $items AS item
                        MATCH (a {{id: item.source_id}}), (b {{id: item.target_id}})
                        CREATE (a)-[r:{_label(rel_type)} {{id: item.id}}]->(b)
                    $$, %s) AS (result agtype)
                """
                cur.execute(query, (json.dumps({"items": items}),))
            conn.commit()

    def merge_security_rule(self, repository_id: str, updates: list[dict]) -> None:
        """Patches auth/role/middleware-chain fields on already-written
        API symbols in place, without touching anything else about them
        (or the rest of their file's symbols/edges) - used to fold a
        Spring Security global filter-chain rule
        (app.services.spring_security_merger) into a route detected
        separately, in a different file, from its own annotations. Each
        item: {"id", "auth_required", "auth_mechanism", "required_roles",
        "middleware_chain"}."""
        if not updates:
            return
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            query = f"""
                SELECT * FROM cypher({graph}, $$
                    UNWIND $items AS item
                    MATCH (n {{id: item.id}})
                    SET n.auth_required = item.auth_required,
                        n.auth_mechanism = item.auth_mechanism,
                        n.required_roles = item.required_roles,
                        n.middleware_chain = item.middleware_chain
                $$, %s) AS (result agtype)
            """
            cur.execute(query, (json.dumps({"items": updates}),))
            conn.commit()

    def get_symbol(self, repository_id: str, symbol_id: str) -> Symbol | None:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(
                f"SELECT * FROM cypher({graph}, $$ MATCH (n {{id: $id}}) RETURN n $$, %s) AS (n agtype)",
                (json.dumps({"id": symbol_id}),),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return _symbol_from_properties(parse_agtype(row[0])["properties"])

    def all_symbols(self, repository_id: str) -> list[Symbol]:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(f"SELECT * FROM cypher({graph}, $$ MATCH (n) RETURN n $$) AS (n agtype)")
            return [_symbol_from_properties(parse_agtype(row[0])["properties"]) for row in cur.fetchall()]

    def find_symbols(
        self,
        repository_id: str,
        kind: SymbolKind | None = None,
        name_contains: str | None = None,
        limit: int | None = None,
    ) -> list[Symbol]:
        symbols = self.all_symbols(repository_id)
        if kind is not None:
            symbols = [s for s in symbols if s.kind == kind]
        if name_contains:
            needle = name_contains.lower()
            symbols = [s for s in symbols if needle in s.name.lower() or needle in s.qualified_name.lower()]
        symbols.sort(key=lambda s: (s.file_path, s.start_line))
        return symbols[:limit] if limit else symbols

    def find_by_simple_name(self, repository_id: str, name: str, kinds: set[SymbolKind] | None = None) -> list[Symbol]:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(
                f"SELECT * FROM cypher({graph}, $$ MATCH (n {{name: $name}}) RETURN n $$, %s) AS (n agtype)",
                (json.dumps({"name": name}),),
            )
            symbols = [_symbol_from_properties(parse_agtype(row[0])["properties"]) for row in cur.fetchall()]
        if kinds:
            symbols = [s for s in symbols if s.kind in kinds]
        return symbols

    def find_by_qualified_name(self, repository_id: str, qualified_name: str) -> Symbol | None:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(
                f"SELECT * FROM cypher({graph}, $$ MATCH (n {{qualified_name: $qn}}) RETURN n $$, %s) AS (n agtype)",
                (json.dumps({"qn": qualified_name}),),
            )
            row = cur.fetchone()
            return _symbol_from_properties(parse_agtype(row[0])["properties"]) if row else None

    def get_relationships(
        self,
        repository_id: str,
        source_id: str | None = None,
        target_id: str | None = None,
        types: set | None = None,
    ) -> list[Relationship]:
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            if source_id is not None:
                pattern, params = "(a {id: $anchor})-[r]->(b)", {"anchor": source_id}
            elif target_id is not None:
                pattern, params = "(a)-[r]->(b {id: $anchor})", {"anchor": target_id}
            else:
                pattern, params = "(a)-[r]->(b)", {}
            cur.execute(
                f"SELECT * FROM cypher({graph}, $$ MATCH {pattern} RETURN r, a.id, b.id $$, %s)"
                f" AS (r agtype, source_id agtype, target_id agtype)",
                (json.dumps(params),),
            )
            relationships = []
            for r, src, tgt in cur.fetchall():
                edge = parse_agtype(r)
                relationships.append(
                    Relationship(
                        id=edge["properties"]["id"],
                        repository_id=repository_id,
                        source_id=parse_agtype(src),
                        target_id=parse_agtype(tgt),
                        type=RelationshipType(edge["label"]),
                    )
                )
        if types:
            relationships = [r for r in relationships if r.type in types]
        return relationships

    def neighbors(
        self,
        repository_id: str,
        symbol_id: str,
        relationship_types: set | None = None,
        direction: str = "out",
        hops: int = 1,
    ) -> tuple[list[Symbol], list[Relationship]]:
        nodes: dict[str, Symbol] = {}
        edges: dict[str, Relationship] = {}
        frontier = {symbol_id}

        for _ in range(max(hops, 0)):
            next_frontier = set()
            for node_id in frontier:
                out_rels = self.get_relationships(repository_id, source_id=node_id, types=relationship_types)
                in_rels = self.get_relationships(repository_id, target_id=node_id, types=relationship_types)
                candidates = []
                if direction in ("out", "both"):
                    candidates.extend(out_rels)
                if direction in ("in", "both"):
                    candidates.extend(in_rels)
                for rel in candidates:
                    edges[rel.id] = rel
                    other_id = rel.target_id if rel.source_id == node_id else rel.source_id
                    other = self.get_symbol(repository_id, other_id)
                    if other is not None:
                        nodes[other_id] = other
                        next_frontier.add(other_id)
            frontier = next_frontier

        anchor = self.get_symbol(repository_id, symbol_id)
        if anchor is not None:
            nodes[symbol_id] = anchor
        return list(nodes.values()), list(edges.values())

    def stats(self, repository_id: str) -> dict:
        symbols = self.all_symbols(repository_id)
        graph = _quoted_literal(repository_id)
        with get_connection() as conn, conn.cursor() as cur:
            self._ensure_graph(cur, repository_id)
            cur.execute(f"SELECT * FROM cypher({graph}, $$ MATCH ()-[r]->() RETURN count(r) $$) AS (n agtype)")
            row = cur.fetchone()
            relationship_count = parse_agtype(row[0]) if row else 0

        files = {s.file_path for s in symbols if s.kind == SymbolKind.MODULE}
        return {
            "files": len(files),
            "classes": sum(1 for s in symbols if s.kind == SymbolKind.CLASS),
            "functions": sum(1 for s in symbols if s.kind == SymbolKind.FUNCTION),
            "methods": sum(1 for s in symbols if s.kind == SymbolKind.METHOD),
            "symbols": len(symbols),
            "relationships": relationship_count,
        }


graph_store = PostgresGraphStore()
