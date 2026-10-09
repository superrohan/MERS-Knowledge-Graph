"""Parses Apache AGE's `agtype` results.

`cypher(...)` returns every column as text shaped like
`{"id": 844..., "label": "CLASS", "properties": {...}}::vertex` for nodes,
similarly for edges, or a plain JSON scalar (`"CALLS"`, `42`, `true`) for
everything else. psycopg has no built-in codec for `agtype`, so this is a
small, deliberate parser rather than a dependency on the immature
apache-age-python client.
"""

from __future__ import annotations

import json
import re

_TYPE_SUFFIX_RE = re.compile(r"::(vertex|edge|path|agtype|vertexid)$")


def parse_agtype(value):
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    text = _TYPE_SUFFIX_RE.sub("", value)
    return json.loads(text)


def as_vertex_properties(value) -> dict:
    """Parses an agtype vertex and returns just its `properties` dict."""
    parsed = parse_agtype(value)
    if isinstance(parsed, dict) and "properties" in parsed:
        return parsed["properties"]
    return parsed or {}


def as_edge_label(value) -> str | None:
    parsed = parse_agtype(value)
    if isinstance(parsed, dict):
        return parsed.get("label")
    return parsed


def quote_cypher_string(value: str) -> str:
    """Escapes a string for embedding directly in a Cypher literal.

    Cypher queries are built as SQL text (the `cypher()` function takes
    the query as a string, so it can't be parameterized like a normal SQL
    query) - every value interpolated into one must go through this.
    """
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'
