"""Normalizes a route path so the same logical endpoint matches
regardless of which framework's path-param syntax defined it or called
it: FastAPI/Spring's `{id}`, Express's `:id`, and Flask's `<id>`/`<int:id>`
all become the same placeholder. This is what lets a frontend `fetch()`
call (in one repository) resolve to the backend route that defines it
(in a different repository) by shape, not by name - there's no shared
symbol name to match on across a network boundary.
"""

from __future__ import annotations

import re

_PATH_PARAM_RE = re.compile(r"\{[^}]+\}|:[A-Za-z_]\w*|<[^>]+>")


def normalize_route_path(path: str | None) -> str:
    if not path:
        return ""
    normalized = _PATH_PARAM_RE.sub("{}", path)
    return normalized.rstrip("/") or "/"


def route_key(method: str | None, path: str | None) -> str:
    primary_method = (method or "").upper().split(",")[0].strip()
    return f"{primary_method} {normalize_route_path(path)}"


def route_methods(method: str | None) -> set[str]:
    return {m.strip().upper() for m in (method or "").split(",") if m.strip()}
