"""Express-style route registration + auth-middleware detection.

Unlike Python/Java's decorator/annotation-based frameworks, Express
registers routes via plain calls: `app.get('/path', ...middlewares,
handler)`. The route and its handler aren't lexically attached to each
other the way a decorator sits on its function, so detection here is a
two-step process: collect every route-registration call while walking
the file, then resolve each one's handler (a same-file named function,
or an inline arrow/function expression) once the whole file's symbols
are known.

Every middleware in the registration call is recorded as a
MiddlewareStep in order - not just the ones that look auth-related - so
the full request pipeline to the handler is visible; only names matching
a known auth pattern get an explained `detail` (see MiddlewareStep). The
handler's own body text is also scanned for req.query.X/req.body.X
usage to recover query/body params Express's routing itself has no
typed signature to declare (tagged source="observed" - see RequestParam).
"""

from __future__ import annotations

import re

from app.domain.api_models import ApiEndpointInfo, MiddlewareStep, RequestParam

_ROUTER_METHODS = {"get", "post", "put", "delete", "patch", "all"}
_ROUTER_OBJECT_PATTERN = re.compile(r"app|router", re.IGNORECASE)
_AUTH_MIDDLEWARE_PATTERN = re.compile(r"auth|login|jwt|token|permission|guard|protect", re.IGNORECASE)
_PATH_PARAM_RE = re.compile(r"[:{](\w+)[}]?")

_QUERY_USAGE_RE = re.compile(r"req(?:uest)?\.query(?:\.(\w+)|\[['\"](\w+)['\"]\])")
_BODY_USAGE_RE = re.compile(r"req(?:uest)?\.body(?:\.(\w+)|\[['\"](\w+)['\"]\])")


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def is_route_registration_call(call_node, source_bytes: bytes) -> bool:
    fn = call_node.child_by_field_name("function")
    if fn is None or fn.type != "member_expression":
        return False
    obj = fn.child_by_field_name("object")
    prop = fn.child_by_field_name("property")
    if obj is None or prop is None or obj.type != "identifier":
        return False
    method = _text(prop, source_bytes)
    return method in _ROUTER_METHODS and bool(_ROUTER_OBJECT_PATTERN.search(_text(obj, source_bytes)))


def parse_route_registration(call_node, source_bytes: bytes) -> dict | None:
    """Extracts (method, path, middleware_names, handler_node) from a
    call already confirmed by is_route_registration_call."""
    fn = call_node.child_by_field_name("function")
    method = _text(fn.child_by_field_name("property"), source_bytes).upper()

    args_node = call_node.child_by_field_name("arguments")
    if args_node is None or not args_node.named_children:
        return None
    args = args_node.named_children

    path_node = args[0]
    if path_node.type != "string":
        return None
    path = _text(path_node, source_bytes).strip("'\"`")

    handler_node = args[-1]
    middleware_names = [_text(a, source_bytes) for a in args[1:-1] if a.type == "identifier"]

    return {"method": method, "path": path, "middleware_names": middleware_names, "handler_node": handler_node}


def _middleware_step(name: str) -> MiddlewareStep:
    detail = None
    if _AUTH_MIDDLEWARE_PATTERN.search(name):
        detail = "requires authentication (middleware)"
    return MiddlewareStep(name=name, kind="middleware", detail=detail)


def _observed_params(handler_symbol, source_bytes: bytes) -> list[RequestParam]:
    if handler_symbol is None:
        return []
    lines = source_bytes.decode("utf-8", errors="replace").splitlines()
    body_text = "\n".join(lines[handler_symbol.start_line - 1 : handler_symbol.end_line])

    observed: dict[str, RequestParam] = {}
    for match in _QUERY_USAGE_RE.finditer(body_text):
        name = match.group(1) or match.group(2)
        if name and name not in observed:
            observed[name] = RequestParam(name=name, location="query", required=False, type=None, source="observed")
    for match in _BODY_USAGE_RE.finditer(body_text):
        name = match.group(1) or match.group(2)
        if name and name not in observed:
            observed[name] = RequestParam(name=name, location="body", required=False, type=None, source="observed")
    return list(observed.values())


def build_api_info(route: dict, handler_symbol, source_bytes: bytes) -> ApiEndpointInfo:
    auth_required = False
    auth_mechanism = None
    middleware_chain = [_middleware_step(name) for name in route["middleware_names"]]
    for step in middleware_chain:
        if step.detail is not None:
            auth_required = True
            auth_mechanism = "middleware"
            break

    request_params: list[RequestParam] = []
    path_param_names = set(_PATH_PARAM_RE.findall(route["path"]))
    for name in path_param_names:
        request_params.append(RequestParam(name=name, location="path", required=True, type=None, source="declared"))

    declared_names = {p.name for p in request_params}
    for observed in _observed_params(handler_symbol, source_bytes):
        if observed.name not in declared_names:
            request_params.append(observed)

    return ApiEndpointInfo(
        http_method=route["method"],
        route_path=route["path"],
        auth_required=auth_required,
        auth_mechanism=auth_mechanism,
        required_roles=[],
        request_params=request_params,
        framework="express",
        middleware_chain=middleware_chain,
    )
