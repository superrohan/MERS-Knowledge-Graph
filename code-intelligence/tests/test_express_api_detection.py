from app.domain.models import SymbolKind
from app.parsing.javascript_parser import JavaScriptFileParser


def test_named_handler_becomes_an_api_symbol():
    source = (
        "function login(req, res) {\n"
        "  return res.json({ ok: true });\n"
        "}\n\n"
        "app.post('/login', login);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    login = next(s for s in parsed.symbols if s.name == "login")
    assert login.kind == SymbolKind.API
    assert login.api.http_method == "POST"
    assert login.api.route_path == "/login"
    assert login.api.framework == "express"


def test_auth_middleware_marks_route_as_auth_required():
    source = (
        "function getProfile(req, res) {}\n\n"
        "router.get('/profile', authMiddleware, getProfile);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "getProfile")
    assert handler.api.auth_required is True
    assert handler.api.auth_mechanism == "middleware"


def test_route_without_auth_middleware_is_not_auth_required():
    source = (
        "function health(req, res) {}\n\n"
        "app.get('/health', health);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "health")
    assert handler.api.auth_required is False


def test_path_params_are_extracted():
    source = (
        "function getUser(req, res) {}\n\n"
        "app.get('/users/:userId', getUser);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "getUser")
    param_names = {p.name for p in handler.api.request_params}
    assert param_names == {"userId"}
    assert all(p.location == "path" for p in handler.api.request_params)


def test_forward_referenced_handler_still_resolves():
    """Route registered before the handler function is defined further
    down the file - a common Express layout."""
    source = (
        "app.post('/orders', createOrder);\n\n"
        "function createOrder(req, res) {\n"
        "  return orderService.create(req.body);\n"
        "}\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "createOrder")
    assert handler.kind == SymbolKind.API
    assert handler.api.route_path == "/orders"


def test_non_router_call_is_not_treated_as_a_route():
    source = "function helper() {}\n\nsomeObject.get('/not-a-route', helper);\n"
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    helper = next(s for s in parsed.symbols if s.name == "helper")
    assert helper.kind == SymbolKind.FUNCTION
    assert helper.api is None


def test_full_middleware_chain_is_recorded_regardless_of_recognition():
    source = (
        "function getProfile(req, res) {}\n\n"
        "router.get('/profile', authMiddleware, cacheMiddleware, getProfile);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "getProfile")
    names = [m.name for m in handler.api.middleware_chain]
    assert names == ["authMiddleware", "cacheMiddleware"]
    assert "authentication" in handler.api.middleware_chain[0].detail
    # cacheMiddleware isn't a recognized auth pattern - recorded, not guessed.
    assert handler.api.middleware_chain[1].detail is None


def test_query_and_body_usage_is_observed_from_the_handler_body():
    source = (
        "function search(req, res) {\n"
        "  const status = req.query.status;\n"
        "  const term = req.body.term;\n"
        "  return run(status, term);\n"
        "}\n\n"
        "app.post('/search', search);\n"
    )
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "search")
    params = {p.name: p for p in handler.api.request_params}
    assert params["status"].location == "query"
    assert params["status"].source == "observed"
    assert params["term"].location == "body"
    assert params["term"].source == "observed"


def test_path_params_are_declared_not_observed():
    source = "function getUser(req, res) {}\n\napp.get('/users/:userId', getUser);\n"
    parsed, _ = JavaScriptFileParser("repo1").parse("app.js", source)

    handler = next(s for s in parsed.symbols if s.name == "getUser")
    param = next(p for p in handler.api.request_params if p.name == "userId")
    assert param.location == "path"
    assert param.source == "declared"
