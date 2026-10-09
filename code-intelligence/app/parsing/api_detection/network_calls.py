"""Detects frontend network calls - `fetch(...)`, `axios.get/post/...(...)`,
`axios({...})` - and extracts (method, path) so they can be matched
against a backend API route (possibly in an entirely different
repository - see app.parsing.api_detection.route_matching) rather than
resolved by name, since there's no shared symbol across a network call.

Heuristic like the rest of the API detectors: recognizes the *shape* of
a call, not a verified import of `axios`/a real `fetch` global.
"""

from __future__ import annotations

_AXIOS_METHODS = {"get", "post", "put", "delete", "patch"}


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _extract_path(node, source_bytes: bytes) -> str | None:
    if node is None:
        return None
    if node.type == "string":
        return _text(node, source_bytes).strip("'\"`")
    if node.type == "template_string":
        parts = []
        for child in node.children:
            if child.type == "string_fragment":
                parts.append(_text(child, source_bytes))
            elif child.type == "template_substitution":
                parts.append("{}")
        return "".join(parts)
    if node.type == "binary_expression":
        # Best-effort for string concatenation ('/orders/' + id): take the
        # literal prefix and treat the rest as one path-param placeholder.
        left = node.child_by_field_name("left")
        if left is not None and left.type == "string":
            return _text(left, source_bytes).strip("'\"`") + "{}"
    return None


def _method_from_options_object(options_node, source_bytes: bytes) -> str | None:
    if options_node is None or options_node.type != "object":
        return None
    for pair in options_node.named_children:
        if pair.type != "pair":
            continue
        key_node = pair.child_by_field_name("key")
        if key_node is not None and _text(key_node, source_bytes).strip("'\"") == "method":
            value_node = pair.child_by_field_name("value")
            if value_node is not None and value_node.type == "string":
                return _text(value_node, source_bytes).strip("'\"").upper()
    return None


def _url_from_options_object(options_node, source_bytes: bytes) -> str | None:
    if options_node is None or options_node.type != "object":
        return None
    for pair in options_node.named_children:
        if pair.type != "pair":
            continue
        key_node = pair.child_by_field_name("key")
        if key_node is not None and _text(key_node, source_bytes).strip("'\"") == "url":
            return _extract_path(pair.child_by_field_name("value"), source_bytes)
    return None


def detect_network_call(call_node, source_bytes: bytes) -> tuple[str, str] | None:
    """Returns (http_method, path) for a recognized fetch/axios call, or
    None if this call doesn't look like one."""
    fn = call_node.child_by_field_name("function")
    if fn is None:
        return None
    args_node = call_node.child_by_field_name("arguments")
    args = args_node.named_children if args_node is not None else []

    if fn.type == "identifier":
        name = _text(fn, source_bytes)
        if name == "fetch" and args:
            path = _extract_path(args[0], source_bytes)
            if path is None:
                return None
            method = _method_from_options_object(args[1], source_bytes) if len(args) > 1 else None
            return (method or "GET", path)
        if name == "axios" and args:
            options = args[0]
            path = _url_from_options_object(options, source_bytes)
            method = _method_from_options_object(options, source_bytes)
            if path is None:
                return None
            return (method or "GET", path)
        return None

    if fn.type == "member_expression":
        obj = fn.child_by_field_name("object")
        prop = fn.child_by_field_name("property")
        if obj is None or prop is None or obj.type != "identifier" or _text(obj, source_bytes) != "axios":
            return None
        method = _text(prop, source_bytes)
        if method not in _AXIOS_METHODS or not args:
            return None
        path = _extract_path(args[0], source_bytes)
        if path is None:
            return None
        return (method.upper(), path)

    return None
