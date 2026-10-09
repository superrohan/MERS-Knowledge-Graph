"""API-endpoint metadata attached to a handler Symbol (spec §22 lists
"API" as its own graph node type).

Kept as a separate, optional structure rather than new top-level fields
scattered across Symbol, so a plain function/method is unaffected and
every language's API detector (Flask/FastAPI/Django, Express/NestJS,
Spring, ...) produces the same shape.
"""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class RequestParam:
    name: str
    location: str  # "path" | "query" | "body" | "header"
    required: bool = True
    type: str | None = None
    # "declared": explicit in the route/signature itself (a FastAPI
    # function param, a Spring @RequestParam, an Express :id path
    # segment). "observed": found by scanning the handler body for
    # request.args/req.query/req.body-style access - real usage, but
    # less certain than something declared in the route's own shape
    # (e.g. it won't catch a param read conditionally, and can't tell
    # whether it's actually required).
    source: str = "declared"


@dataclass
class MiddlewareStep:
    """One entry in the chain of decorators/middleware/dependencies/
    annotations a request passes through on the way to the route
    handler, in source declaration order. `detail` is only ever filled
    in when the step's *effect* is structurally recognizable (a known
    auth/role pattern) - an unrecognized name is still recorded (so the
    chain is complete), just without a guessed explanation."""

    name: str
    kind: str  # "decorator" | "middleware" | "dependency" | "annotation" | "global_filter"
    detail: str | None = None

    def to_dict(self) -> dict:
        return {"name": self.name, "kind": self.kind, "detail": self.detail}


@dataclass
class ApiEndpointInfo:
    http_method: str | None = None
    route_path: str | None = None
    auth_required: bool = False
    auth_mechanism: str | None = None  # "jwt" | "session" | "api_key" | "oauth2" | ...
    required_roles: list[str] = field(default_factory=list)
    request_params: list[RequestParam] = field(default_factory=list)
    framework: str | None = None  # "flask" | "fastapi" | "django" | "express" | "nestjs" | "spring" | "manual"
    # The ordered decorator/middleware/dependency/annotation chain
    # between the route registration and the handler actually running -
    # e.g. Express's [authMiddleware, validateBody] before the route
    # function, or Python's stacked decorators. See MiddlewareStep.
    middleware_chain: list[MiddlewareStep] = field(default_factory=list)
    # Only meaningful when framework == "manual" (a user-declared
    # endpoint, see app.services.manual_api_annotations) - whether it was
    # checked against the endpoints actually detected in the code graph
    # (app.services.api_annotation_verification). None for a
    # parser-detected endpoint, since it *is* the code graph.
    verification_status: str | None = None  # "unverified" | "confirmed" | "conflicting" | "no_match"
    verification_notes: str | None = None

    def to_dict(self) -> dict:
        return {
            "httpMethod": self.http_method,
            "routePath": self.route_path,
            "authRequired": self.auth_required,
            "authMechanism": self.auth_mechanism,
            "requiredRoles": self.required_roles,
            "requestParams": [
                {"name": p.name, "location": p.location, "required": p.required, "type": p.type, "source": p.source}
                for p in self.request_params
            ],
            "framework": self.framework,
            "middlewareChain": [m.to_dict() for m in self.middleware_chain],
            "verificationStatus": self.verification_status,
            "verificationNotes": self.verification_notes,
        }
