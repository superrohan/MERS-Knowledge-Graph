"""Parses a Spring Security configuration class's URL-pattern-based
authorization rules (a `SecurityFilterChain` @Bean, or the older
`WebSecurityConfigurerAdapter#configure(HttpSecurity)` override) into an
ordered list of (Ant-style path pattern -> required auth/role) rules -
the *global* filter chain, as opposed to the per-route
@PreAuthorize/@Secured annotations spring_api.py already detects
directly on each route.

Real Spring Security evaluates these rules in declaration order and
applies the first pattern that matches a request (see
app.services.spring_security_merger, which does that matching against
already-detected routes) - order is preserved here for that reason, not
just style.

Heuristic like every other detector in this package: recognizes the
fluent `.requestMatchers("/x").hasRole("Y")` / `.antMatchers(...).
permitAll()` call shape wherever it appears in a class that looks like
security config - it doesn't resolve imports to confirm SecurityFilterChain
is really Spring's type. Only the *immediate* next call after a matcher
is read as its effect - a rule wrapped in additional intermediate calls
(e.g. `.requestMatchers(...).access(...)`, a custom AuthorizationManager)
beyond the recognized effect names is left undetected rather than
guessed at.
"""

from __future__ import annotations

_MATCHER_METHODS = {"requestMatchers", "antMatchers", "mvcMatchers"}
_ROLE_EFFECTS = {"hasRole", "hasAnyRole"}
_AUTHORITY_EFFECTS = {"hasAuthority", "hasAnyAuthority"}
_OPEN_EFFECTS = {"permitAll", "anonymous"}
_AUTH_EFFECTS = {"authenticated", "fullyAuthenticated"}
_DENY_EFFECTS = {"denyAll"}
_KNOWN_EFFECTS = _ROLE_EFFECTS | _AUTHORITY_EFFECTS | _OPEN_EFFECTS | _AUTH_EFFECTS | _DENY_EFFECTS


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _string_literal_value(node, source_bytes: bytes) -> str | None:
    if node is None or "string_literal" not in node.type:
        return None
    return _text(node, source_bytes).strip('"')


def is_security_config_class(class_annotations: list[dict], superclass_name: str | None) -> bool:
    annotation_names = {a["name"] for a in class_annotations}
    return "Configuration" in annotation_names and (
        "EnableWebSecurity" in annotation_names or superclass_name == "WebSecurityConfigurerAdapter"
    )


def _find_chain_root(node):
    """Walks up from any call in a fluent chain to the outermost one -
    e.g. from `.requestMatchers(...)` in `a.requestMatchers(x).hasRole(y)`
    up to the `.hasRole(y)` node, which is the tree's actual root for
    this expression (a chain nests inside-out: the *last* call written
    is the outermost node)."""
    current = node
    while (
        current.parent is not None
        and current.parent.type == "method_invocation"
        and current.parent.child_by_field_name("object") == current
    ):
        current = current.parent
    return current


def _flatten_chain(root_node, source_bytes: bytes) -> list[tuple[str, list[str]]]:
    """Given a chain's outermost method_invocation, returns
    (method_name, string_args) in actual declaration order (the reverse
    of tree nesting order - see _find_chain_root)."""
    calls = []
    current = root_node
    while current is not None and current.type == "method_invocation":
        name_node = current.child_by_field_name("name")
        args_node = current.child_by_field_name("arguments")
        name = _text(name_node, source_bytes) if name_node is not None else None
        args = []
        if args_node is not None:
            for arg in args_node.named_children:
                value = _string_literal_value(arg, source_bytes)
                if value is not None:
                    args.append(value)
        if name:
            calls.append((name, args))
        current = current.child_by_field_name("object")
    calls.reverse()
    return calls


def _rules_from_chain(calls: list[tuple[str, list[str]]], file_path: str, order_offset: int) -> list[dict]:
    rules = []
    order = order_offset
    for i, (name, args) in enumerate(calls):
        if name not in _MATCHER_METHODS or not args:
            continue
        if i + 1 >= len(calls):
            continue
        effect_name, effect_args = calls[i + 1]
        if effect_name not in _KNOWN_EFFECTS:
            continue
        if effect_name in _ROLE_EFFECTS:
            effect, roles = "has_role", list(effect_args)
        elif effect_name in _AUTHORITY_EFFECTS:
            effect, roles = "has_authority", list(effect_args)
        elif effect_name in _OPEN_EFFECTS:
            effect, roles = "permit_all", []
        elif effect_name in _DENY_EFFECTS:
            effect, roles = "deny_all", []
        else:
            effect, roles = "authenticated", []
        for pattern in args:
            rules.append(
                {"pattern": pattern, "effect": effect, "roles": roles, "source_file": file_path, "order": order}
            )
            order += 1
    return rules


def extract_security_rules(class_body_node, file_path: str, source_bytes: bytes) -> list[dict]:
    """Walks every statement in a security config class's body for
    fluent `.requestMatchers(...).<effect>(...)` chains (whether inside
    a `.authorizeHttpRequests(auth -> ...)` lambda, the older
    `.authorizeRequests()...` statement form, or anything else shaped
    the same way), returning ordered rules - see module docstring for
    matching semantics."""
    rules: list[dict] = []
    seen_chain_roots: set[tuple[int, int]] = set()

    def walk(node):
        if node.type == "method_invocation":
            name_node = node.child_by_field_name("name")
            name = _text(name_node, source_bytes) if name_node is not None else None
            if name in _MATCHER_METHODS:
                root = _find_chain_root(node)
                key = (root.start_byte, root.end_byte)
                if key not in seen_chain_roots:
                    seen_chain_roots.add(key)
                    calls = _flatten_chain(root, source_bytes)
                    rules.extend(_rules_from_chain(calls, file_path, len(rules)))
        for child in node.children:
            walk(child)

    walk(class_body_node)
    return rules
