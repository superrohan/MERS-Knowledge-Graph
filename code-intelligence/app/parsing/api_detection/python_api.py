"""Flask/FastAPI route + auth detection from a function's decorators.

Heuristic, not a framework-aware type system: route decorators are
recognized by shape (`@x.get(...)`, `@x.post(...)`, `@x.route(...,
methods=[...])`), and auth/role requirements by matching common
decorator/dependency *names* against known patterns (Flask-Login,
Flask-JWT-Extended, Flask-HTTPAuth, FastAPI's Depends/Security). A
framework this doesn't recognize simply produces no API info - never a
guessed one.

Beyond the route/auth signal itself, this also records:
 - every decorator/dependency between the route decorator and the
   handler as a MiddlewareStep, in source order, not just the
   auth-recognized ones - the point isn't to guess what an unrecognized
   decorator does, but to show the *whole* chain a request actually
   passes through.
 - query/body params a Flask handler reads via request.args/request.json
   even though Flask's own routing has no typed signature to read them
   from - found by scanning the handler body text, so it's real usage,
   just tagged source="observed" (see RequestParam) rather than
   "declared" the way a FastAPI/typed param is.
"""

from __future__ import annotations

import re

from app.domain.api_models import ApiEndpointInfo, MiddlewareStep, RequestParam

_HTTP_METHODS = {"get", "post", "put", "delete", "patch", "head", "options"}

_AUTH_KEYWORDS = {
    "login_required": "session",
    "jwt_required": "jwt",
    "requires_auth": "custom",
    "authenticated": "custom",
    "auth_required": "custom",
    "permission_required": "custom",
    "requires_role": "custom",
    "roles_required": "custom",
}
_ROLE_DECORATOR_NAMES = {"requires_role", "roles_required", "require_role", "has_role", "role_required"}
_AUTH_DEPENDENCY_NAME_PATTERN = re.compile(r"auth|current_user|require|jwt|token|permission", re.IGNORECASE)

_PATH_PARAM_RE = re.compile(r"[{<]:?(?:\w+:)?(\w+)[}>]")

# A FastAPI param typed as one of these is a plain query param; anything
# else (a capitalized custom type - almost always a Pydantic model) is
# treated as the request body. Heuristic, like the rest of this file -
# there's no import resolution confirming a type really is a BaseModel.
_PRIMITIVE_TYPES = {
    "str", "int", "float", "bool", "bytes", "UUID", "date", "datetime", "time",
    "list", "List", "dict", "Dict", "Optional", "Any",
}

# Flask has no typed signature to read query/body params from - these
# scan the handler body's actual source text for real usage instead.
_FLASK_QUERY_RE = re.compile(r"request\.args(?:\.get\(\s*['\"](\w+)['\"]|\[['\"](\w+)['\"]\])")
_FLASK_BODY_RE = re.compile(
    r"request\.(?:json|get_json\(\))(?:\.get\(\s*['\"](\w+)['\"]|\[['\"](\w+)['\"]\])"
)


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _string_literal_value(node, source_bytes: bytes) -> str | None:
    if node is None or node.type != "string":
        return None
    text = _text(node, source_bytes)
    return text.strip("\"'")


def _decorator_call_parts(decorator_node, source_bytes: bytes):
    """Returns (base_name, full_name, positional_args, kwargs) for a
    decorator, whether it's a bare name (`@login_required`) or a call
    (`@app.post("/x")`, `@requires_role("admin")`)."""
    target = decorator_node.named_children[0] if decorator_node.named_children else None
    if target is None:
        return None, None, [], {}

    if target.type == "call":
        fn = target.child_by_field_name("function")
        args_node = target.child_by_field_name("arguments")
    else:
        fn = target
        args_node = None

    if fn.type == "attribute":
        attr = fn.child_by_field_name("attribute")
        full_name = _text(fn, source_bytes)
        base_name = _text(attr, source_bytes) if attr is not None else full_name
    else:
        full_name = base_name = _text(fn, source_bytes)

    positional: list[str] = []
    kwargs: dict[str, object] = {}
    if args_node is not None:
        for arg in args_node.named_children:
            if arg.type == "keyword_argument":
                key_node = arg.child_by_field_name("name")
                value_node = arg.child_by_field_name("value")
                if key_node is None:
                    continue
                key = _text(key_node, source_bytes)
                if value_node is not None and value_node.type == "list":
                    kwargs[key] = [
                        _string_literal_value(v, source_bytes)
                        for v in value_node.named_children
                        if v.type == "string"
                    ]
                else:
                    kwargs[key] = _string_literal_value(value_node, source_bytes)
            elif arg.type == "string":
                value = _string_literal_value(arg, source_bytes)
                if value is not None:
                    positional.append(value)

    return base_name, full_name, positional, kwargs


def extract_decorators(decorated_node, source_bytes: bytes) -> list[dict]:
    decorators = []
    for child in decorated_node.children:
        if child.type != "decorator":
            continue
        base, full, args, kwargs = _decorator_call_parts(child, source_bytes)
        if base is not None:
            decorators.append({"base": base, "full": full, "args": args, "kwargs": kwargs})
    return decorators


def _dependency_param_info(param_node, source_bytes: bytes) -> tuple[str | None, bool]:
    """For `x = Depends(get_current_user)` / `x = Security(...)`, returns
    (dependency_callable_name, is_dependency)."""
    if param_node.type != "default_parameter":
        return None, False
    value = param_node.child_by_field_name("value")
    if value is None or value.type != "call":
        return None, False
    fn = value.child_by_field_name("function")
    if fn is None or _text(fn, source_bytes) not in ("Depends", "Security"):
        return None, False
    args = value.child_by_field_name("arguments")
    if args is None or not args.named_children:
        return "", True
    return _text(args.named_children[0], source_bytes), True


def _decorator_middleware_step(dec: dict) -> MiddlewareStep:
    """A non-route decorator, recorded in the chain regardless of
    whether its effect is recognized - only a recognized auth/role
    pattern gets a `detail` explaining what it does."""
    detail = None
    if dec["base"] in _AUTH_KEYWORDS:
        detail = f"requires authentication ({_AUTH_KEYWORDS[dec['base']]})"
    if dec["base"] in _ROLE_DECORATOR_NAMES and dec["args"]:
        roles = ", ".join(a for a in dec["args"] if a)
        detail = f"requires role(s): {roles}" if roles else detail
    return MiddlewareStep(name=dec["full"] or dec["base"], kind="decorator", detail=detail)


def _flask_observed_params(function_node, source_bytes: bytes) -> list[RequestParam]:
    body_node = function_node.child_by_field_name("body")
    if body_node is None:
        return []
    body_text = _text(body_node, source_bytes)

    observed: dict[str, RequestParam] = {}
    for match in _FLASK_QUERY_RE.finditer(body_text):
        name = match.group(1) or match.group(2)
        if name and name not in observed:
            observed[name] = RequestParam(name=name, location="query", required=False, type=None, source="observed")
    for match in _FLASK_BODY_RE.finditer(body_text):
        name = match.group(1) or match.group(2)
        if name and name not in observed:
            observed[name] = RequestParam(name=name, location="body", required=False, type=None, source="observed")
    return list(observed.values())


def detect_api_endpoint(decorators: list[dict], function_node, source_bytes: bytes) -> ApiEndpointInfo | None:
    route_decorator = None
    for dec in decorators:
        if dec["base"] in _HTTP_METHODS or dec["base"] == "route":
            route_decorator = dec
            break
    if route_decorator is None:
        return None

    route_path = route_decorator["args"][0] if route_decorator["args"] else None
    if route_decorator["base"] == "route":
        methods = route_decorator["kwargs"].get("methods") or ["GET"]
        http_method = ",".join(m for m in methods if m)
    else:
        http_method = route_decorator["base"].upper()
    framework = "flask" if route_decorator["base"] == "route" else "fastapi"

    auth_required = False
    auth_mechanism = None
    required_roles: list[str] = []
    middleware_chain: list[MiddlewareStep] = []
    for dec in decorators:
        if dec is route_decorator:
            continue
        if dec["base"] in _AUTH_KEYWORDS:
            auth_required = True
            auth_mechanism = auth_mechanism or _AUTH_KEYWORDS[dec["base"]]
        if dec["base"] in _ROLE_DECORATOR_NAMES:
            required_roles.extend(a for a in dec["args"] if a)
        middleware_chain.append(_decorator_middleware_step(dec))

    request_params: list[RequestParam] = []
    parameters = function_node.child_by_field_name("parameters")
    if parameters is not None:
        path_param_names = set(_PATH_PARAM_RE.findall(route_path or ""))
        for param in parameters.named_children:
            if param.type == "identifier":
                name_node = param
            else:
                name_node = param.child_by_field_name("name")
                if name_node is None and param.named_children and param.named_children[0].type == "identifier":
                    # typed_parameter has no "name" field - the identifier
                    # is just its first named child.
                    name_node = param.named_children[0]
            if name_node is None:
                continue
            param_name = _text(name_node, source_bytes)
            if param_name in ("self", "request", "req"):
                continue

            dep_name, is_dependency = _dependency_param_info(param, source_bytes)
            if is_dependency:
                is_auth_dep = bool(dep_name and _AUTH_DEPENDENCY_NAME_PATTERN.search(dep_name))
                if is_auth_dep:
                    auth_required = True
                    auth_mechanism = auth_mechanism or "dependency"
                middleware_chain.append(
                    MiddlewareStep(
                        name=f"Depends({dep_name})" if dep_name else "Depends(...)",
                        kind="dependency",
                        detail="requires authentication (dependency)" if is_auth_dep else None,
                    )
                )
                continue

            type_node = param.child_by_field_name("type")
            type_name = _text(type_node, source_bytes) if type_node is not None else None
            has_default = param.type in ("default_parameter", "typed_default_parameter")

            if param_name in path_param_names:
                location = "path"
            elif framework == "fastapi" and type_name and type_name not in _PRIMITIVE_TYPES:
                # A capitalized custom type on a FastAPI param that isn't
                # a path segment is almost always a Pydantic request body
                # model, not a single query value.
                location = "body"
            else:
                location = "query"

            request_params.append(
                RequestParam(
                    name=param_name, location=location, required=not has_default, type=type_name, source="declared"
                )
            )

    if framework == "flask":
        declared_names = {p.name for p in request_params}
        for observed in _flask_observed_params(function_node, source_bytes):
            if observed.name not in declared_names:
                request_params.append(observed)

    return ApiEndpointInfo(
        http_method=http_method,
        route_path=route_path,
        auth_required=auth_required,
        auth_mechanism=auth_mechanism,
        required_roles=required_roles,
        request_params=request_params,
        framework=framework,
        middleware_chain=middleware_chain,
    )
