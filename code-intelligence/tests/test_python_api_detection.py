from app.domain.models import SymbolKind
from app.parsing.python_parser import PythonFileParser


def test_fastapi_route_decorator_produces_api_symbol():
    source = (
        "@router.post('/login')\n"
        "def login(request):\n"
        "    return authenticate(request)\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    login = next(s for s in parsed.symbols if s.name == "login")
    assert login.kind == SymbolKind.API
    assert login.api.http_method == "POST"
    assert login.api.route_path == "/login"
    assert login.api.framework == "fastapi"


def test_flask_route_decorator_with_methods_kwarg():
    source = (
        "@app.route('/admin', methods=['GET', 'POST'])\n"
        "def admin_panel():\n"
        "    return render()\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    admin = next(s for s in parsed.symbols if s.name == "admin_panel")
    assert admin.kind == SymbolKind.API
    assert admin.api.http_method == "GET,POST"
    assert admin.api.route_path == "/admin"
    assert admin.api.framework == "flask"


def test_login_required_decorator_marks_auth_required():
    source = (
        "@app.get('/profile')\n"
        "@login_required\n"
        "def profile():\n"
        "    return get_profile()\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    profile = next(s for s in parsed.symbols if s.name == "profile")
    assert profile.api.auth_required is True
    assert profile.api.auth_mechanism == "session"


def test_requires_role_decorator_extracts_required_roles():
    source = (
        "@app.get('/admin')\n"
        "@requires_role('admin', 'superuser')\n"
        "def admin_only():\n"
        "    return None\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "admin_only")
    assert handler.api.auth_required is True
    assert set(handler.api.required_roles) == {"admin", "superuser"}


def test_fastapi_depends_current_user_marks_auth_required():
    source = (
        "@router.get('/me')\n"
        "def me(current_user=Depends(get_current_user)):\n"
        "    return current_user\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "me")
    assert handler.api.auth_required is True
    assert handler.api.auth_mechanism == "dependency"
    # The dependency itself isn't a request parameter.
    assert handler.api.request_params == []


def test_path_and_query_params_are_distinguished():
    source = (
        "@router.get('/users/{user_id}')\n"
        "def get_user(user_id: int, verbose: bool = False):\n"
        "    return find(user_id)\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "get_user")
    params = {p.name: p for p in handler.api.request_params}
    assert params["user_id"].location == "path"
    assert params["user_id"].required is True
    assert params["verbose"].location == "query"
    assert params["verbose"].required is False


def test_plain_function_without_route_decorator_is_not_an_api_symbol():
    source = "def helper(x):\n    return x + 1\n"
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    helper = next(s for s in parsed.symbols if s.name == "helper")
    assert helper.kind == SymbolKind.FUNCTION
    assert helper.api is None


def test_unrelated_decorator_does_not_produce_an_api_symbol():
    source = "@dataclass\ndef not_a_route():\n    pass\n"
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "not_a_route")
    assert handler.kind == SymbolKind.FUNCTION
    assert handler.api is None


def test_full_decorator_chain_is_recorded_as_middleware_regardless_of_recognition():
    source = (
        "@app.get('/profile')\n"
        "@login_required\n"
        "@cache_response(60)\n"
        "def profile():\n"
        "    return get_profile()\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "profile")
    names = [m.name for m in handler.api.middleware_chain]
    assert names == ["login_required", "cache_response"]
    login_step = handler.api.middleware_chain[0]
    assert login_step.kind == "decorator"
    assert "authentication" in login_step.detail
    # cache_response isn't a recognized auth/role pattern - recorded, not guessed.
    assert handler.api.middleware_chain[1].detail is None


def test_role_decorator_detail_names_the_required_roles():
    source = (
        "@app.get('/admin')\n"
        "@requires_role('admin', 'superuser')\n"
        "def admin_only():\n"
        "    return None\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "admin_only")
    step = handler.api.middleware_chain[0]
    assert "admin" in step.detail and "superuser" in step.detail


def test_fastapi_depends_chain_records_every_dependency_not_just_auth_ones():
    source = (
        "@router.get('/orders')\n"
        "def list_orders(current_user=Depends(get_current_user), db=Depends(get_db)):\n"
        "    return db.query(current_user)\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "list_orders")
    names = [m.name for m in handler.api.middleware_chain]
    assert names == ["Depends(get_current_user)", "Depends(get_db)"]
    assert handler.api.middleware_chain[0].detail is not None  # auth-pattern name
    assert handler.api.middleware_chain[1].detail is None  # get_db isn't an auth pattern


def test_fastapi_pydantic_model_param_is_a_body_param_not_query():
    source = (
        "@router.post('/orders')\n"
        "def create_order(order: OrderCreate, notify: bool = False):\n"
        "    return save(order)\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "create_order")
    params = {p.name: p for p in handler.api.request_params}
    assert params["order"].location == "body"
    assert params["order"].source == "declared"
    assert params["notify"].location == "query"


def test_flask_query_and_body_usage_is_observed_from_the_handler_body():
    source = (
        "@app.route('/search', methods=['POST'])\n"
        "def search():\n"
        "    status = request.args.get('status')\n"
        "    payload = request.json.get('term')\n"
        "    return run_search(status, payload)\n"
    )
    parsed, _ = PythonFileParser("repo1").parse("app.py", source)

    handler = next(s for s in parsed.symbols if s.name == "search")
    params = {p.name: p for p in handler.api.request_params}
    assert params["status"].location == "query"
    assert params["status"].source == "observed"
    assert params["term"].location == "body"
    assert params["term"].source == "observed"
