"""Spring MVC route + auth-annotation detection.

Heuristic: recognizes the standard `@GetMapping`/`@PostMapping`/.../
`@RequestMapping` family and `@PreAuthorize`/`@Secured`/`@RolesAllowed`
for auth, matching by annotation *name* - it doesn't resolve imports to
confirm these really come from `org.springframework.*`, the same
trade-off the Python/Express detectors make.

Every other method-level annotation (not just the auth ones) is also
recorded as a MiddlewareStep, in source declaration order, so the whole
annotation-driven pipeline around a route is visible - `detail` is only
filled in for the recognized auth/role annotations. This is the
*per-route* signal; the class-wide URL-pattern-based rules a
SecurityFilterChain/WebSecurityConfigurerAdapter bean declares elsewhere
in the codebase are a separate, later merge step - see
app.parsing.api_detection.spring_security_config and
app.services.spring_security_merger.
"""

from __future__ import annotations

import re

from app.domain.api_models import ApiEndpointInfo, MiddlewareStep, RequestParam

_MAPPING_METHODS = {
    "GetMapping": "GET",
    "PostMapping": "POST",
    "PutMapping": "PUT",
    "DeleteMapping": "DELETE",
    "PatchMapping": "PATCH",
}
_AUTH_ANNOTATIONS = {"PreAuthorize", "PostAuthorize", "Secured", "RolesAllowed"}
_ROLE_STRING_RE = re.compile(r"['\"](\w+)['\"]")


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _string_literal_value(node, source_bytes: bytes) -> str | None:
    if node is None or "string_literal" not in node.type:
        return None
    text = _text(node, source_bytes)
    return text.strip("\"")


def extract_annotations(container_node, source_bytes: bytes) -> list[dict]:
    """`container_node` is a class_declaration/method_declaration/
    formal_parameter - anything whose first child may be a `modifiers`
    node holding its annotations."""
    if not container_node.children or container_node.children[0].type != "modifiers":
        return []
    modifiers = container_node.children[0]

    annotations = []
    for child in modifiers.named_children:
        if child.type not in ("annotation", "marker_annotation"):
            continue
        name_node = child.child_by_field_name("name")
        name = _text(name_node, source_bytes) if name_node is not None else None
        positional: list[str] = []
        kwargs: dict[str, str] = {}
        args_node = child.child_by_field_name("arguments")
        if args_node is not None:
            for arg in args_node.named_children:
                if arg.type == "element_value_pair":
                    key_node = arg.child_by_field_name("key")
                    value_node = arg.child_by_field_name("value")
                    key = _text(key_node, source_bytes) if key_node is not None else None
                    value = _string_literal_value(value_node, source_bytes) or (
                        _text(value_node, source_bytes) if value_node is not None else None
                    )
                    if key:
                        kwargs[key] = value
                elif "string_literal" in arg.type:
                    value = _string_literal_value(arg, source_bytes)
                    if value is not None:
                        positional.append(value)
        annotations.append({"name": name, "args": positional, "kwargs": kwargs})
    return annotations


def class_base_path(class_annotations: list[dict]) -> str:
    mapping = next((a for a in class_annotations if a["name"] == "RequestMapping"), None)
    if mapping is None:
        return ""
    return mapping["args"][0] if mapping["args"] else (mapping["kwargs"].get("value") or mapping["kwargs"].get("path") or "")


def _annotation_middleware_step(annotation: dict) -> MiddlewareStep:
    detail = None
    if annotation["name"] in _AUTH_ANNOTATIONS:
        roles: list[str] = []
        for arg in annotation["args"]:
            roles.extend(_ROLE_STRING_RE.findall(arg))
        detail = f"requires role(s): {', '.join(roles)}" if roles else "requires authentication"
    args_text = ", ".join(annotation["args"]) if annotation["args"] else ""
    display_name = f"@{annotation['name']}({args_text})" if args_text else f"@{annotation['name']}"
    return MiddlewareStep(name=display_name, kind="annotation", detail=detail)


def detect_api_endpoint(
    method_annotations: list[dict], method_node, base_path: str, source_bytes: bytes
) -> ApiEndpointInfo | None:
    mapping = next(
        (a for a in method_annotations if a["name"] in _MAPPING_METHODS or a["name"] == "RequestMapping"), None
    )
    if mapping is None:
        return None

    if mapping["name"] == "RequestMapping":
        raw_method = mapping["kwargs"].get("method") or "RequestMethod.GET"
        http_method = raw_method.rsplit(".", 1)[-1]
    else:
        http_method = _MAPPING_METHODS[mapping["name"]]

    path = mapping["args"][0] if mapping["args"] else (mapping["kwargs"].get("value") or mapping["kwargs"].get("path"))
    route_path = f"{base_path}{path}" if path else (base_path or None)

    auth_required = False
    required_roles: list[str] = []
    middleware_chain: list[MiddlewareStep] = []
    for annotation in method_annotations:
        if annotation is mapping:
            continue
        if annotation["name"] in _AUTH_ANNOTATIONS:
            auth_required = True
            for arg in annotation["args"]:
                required_roles.extend(_ROLE_STRING_RE.findall(arg))
        middleware_chain.append(_annotation_middleware_step(annotation))

    request_params: list[RequestParam] = []
    parameters = method_node.child_by_field_name("parameters")
    if parameters is not None:
        for param in parameters.named_children:
            name_node = param.child_by_field_name("name")
            if name_node is None:
                continue
            param_annotations = extract_annotations(param, source_bytes)
            annotation_names = {a["name"] for a in param_annotations}
            if "RequestBody" in annotation_names:
                location = "body"
            elif "PathVariable" in annotation_names:
                location = "path"
            elif "RequestParam" in annotation_names:
                location = "query"
            elif "RequestHeader" in annotation_names:
                location = "header"
            else:
                continue  # not request-facing (e.g. injected service)

            type_node = param.child_by_field_name("type")
            type_name = _text(type_node, source_bytes) if type_node is not None else None
            request_params.append(
                RequestParam(
                    name=_text(name_node, source_bytes),
                    location=location,
                    required=True,
                    type=type_name,
                    source="declared",
                )
            )

    return ApiEndpointInfo(
        http_method=http_method,
        route_path=route_path,
        auth_required=auth_required,
        auth_mechanism="annotation" if auth_required else None,
        required_roles=required_roles,
        request_params=request_params,
        framework="spring",
        middleware_chain=middleware_chain,
    )
