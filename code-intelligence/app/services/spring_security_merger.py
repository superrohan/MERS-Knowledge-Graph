"""Merges Spring Security's global URL-pattern-based authorization rules
(app.parsing.api_detection.spring_security_config) into the
already-detected per-route API symbols in the graph.

Spring evaluates authorizeHttpRequests/authorizeRequests rules in
declaration order and applies the FIRST pattern that matches a given
request path (Ant-style: `**` = any number of path segments, `*` = one
path segment, `?` = one character) - this mirrors that first-match-wins
semantics.

A method-level @PreAuthorize/@Secured/@RolesAllowed the per-route
detector already found is never weakened by a global rule found here -
Spring enforces both layers together (method security is *additional*
to the URL filter chain, not a replacement for it). A matched global
rule is always recorded as a middleware_chain entry (for visibility of
the whole real pipeline), but auth_required/required_roles are only ever
*set* from it when the route had no method-level auth signal of its own
- there's nothing for the global rule to conflict with in that case, it
is simply the only auth signal that exists for that route.
"""

from __future__ import annotations

import re

from app.domain.api_models import MiddlewareStep
from app.domain.models import Symbol, SymbolKind

_ANT_TOKEN_RE = re.compile(r"\*\*|\*|\?")


def _ant_pattern_to_regex(pattern: str) -> re.Pattern:
    parts = []
    last = 0
    for m in _ANT_TOKEN_RE.finditer(pattern):
        parts.append(re.escape(pattern[last : m.start()]))
        token = m.group(0)
        if token == "**":
            parts.append(".*")
        elif token == "*":
            parts.append("[^/]*")
        else:  # "?"
            parts.append(".")
        last = m.end()
    parts.append(re.escape(pattern[last:]))
    return re.compile("^" + "".join(parts) + "$")


def _match_rule(route_path: str, ordered_rules: list[dict]) -> dict | None:
    for rule in ordered_rules:
        if _ant_pattern_to_regex(rule["pattern"]).match(route_path):
            return rule
    return None


def compute_updates(symbols: list[Symbol], security_rules: list[dict]) -> list[dict]:
    """Returns the batch of {"id", "auth_required", "auth_mechanism",
    "required_roles", "middleware_chain"} updates to apply via
    GraphStore.merge_security_rule - one entry per Spring API symbol a
    global rule actually matched against its route_path."""
    if not security_rules:
        return []
    ordered_rules = sorted(security_rules, key=lambda r: r["order"])

    updates = []
    for symbol in symbols:
        if symbol.kind != SymbolKind.API or symbol.api is None or symbol.api.framework != "spring":
            continue
        if not symbol.api.route_path:
            continue
        rule = _match_rule(symbol.api.route_path, ordered_rules)
        if rule is None:
            continue

        detail = f'Matched global rule "{rule["pattern"]}" -> {rule["effect"]}'
        if rule["roles"]:
            detail += f" ({', '.join(rule['roles'])})"
        detail += f" declared in {rule['source_file']}."
        middleware_chain = [*symbol.api.middleware_chain, MiddlewareStep(name="SecurityFilterChain", kind="global_filter", detail=detail)]

        auth_required = symbol.api.auth_required
        auth_mechanism = symbol.api.auth_mechanism
        required_roles = list(symbol.api.required_roles)
        # Never weaken an already-detected method-level requirement - only
        # fill in when the per-route detector found no auth signal at all.
        if not symbol.api.auth_required and not symbol.api.required_roles:
            if rule["effect"] in ("has_role", "has_authority"):
                auth_required = True
                auth_mechanism = auth_mechanism or "security_filter_chain"
                required_roles = rule["roles"]
            elif rule["effect"] in ("authenticated", "deny_all"):
                auth_required = True
                auth_mechanism = auth_mechanism or "security_filter_chain"

        updates.append(
            {
                "id": symbol.id,
                "auth_required": auth_required,
                "auth_mechanism": auth_mechanism,
                "required_roles": required_roles,
                "middleware_chain": [m.__dict__ for m in middleware_chain],
            }
        )
    return updates
