from app.domain.models import SymbolKind
from app.parsing.java_parser import JavaFileParser


def test_get_mapping_produces_api_symbol():
    source = (
        "public class OrderController {\n"
        "    @GetMapping(\"/orders/{id}\")\n"
        "    public Order get(@PathVariable String id) {\n"
        "        return service.find(id);\n"
        "    }\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("OrderController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "get")
    assert handler.kind == SymbolKind.API
    assert handler.api.http_method == "GET"
    assert handler.api.route_path == "/orders/{id}"
    assert handler.api.framework == "spring"


def test_class_level_request_mapping_prefixes_method_path():
    source = (
        "@RequestMapping(\"/api/orders\")\n"
        "public class OrderController {\n"
        "    @PostMapping(\"/create\")\n"
        "    public Order create() { return null; }\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("OrderController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "create")
    assert handler.api.route_path == "/api/orders/create"


def test_pre_authorize_marks_auth_required_and_extracts_roles():
    source = (
        "public class AdminController {\n"
        "    @PostMapping(\"/admin\")\n"
        "    @PreAuthorize(\"hasRole('ADMIN')\")\n"
        "    public void admin() {}\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("AdminController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "admin")
    assert handler.api.auth_required is True
    assert "ADMIN" in handler.api.required_roles


def test_request_body_and_path_variable_params_are_classified():
    source = (
        "public class OrderController {\n"
        "    @PostMapping(\"/orders/{id}\")\n"
        "    public Order create(@RequestBody OrderRequest req, @PathVariable String id, OrderService injected) {\n"
        "        return null;\n"
        "    }\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("OrderController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "create")
    params = {p.name: p for p in handler.api.request_params}
    assert params["req"].location == "body"
    assert params["id"].location == "path"
    assert "injected" not in params  # plain injected dependency, not request data


def test_method_without_mapping_annotation_is_not_an_api_symbol():
    source = "public class Foo {\n    public void helper() {}\n}\n"
    parsed, _ = JavaFileParser("repo1").parse("Foo.java", source)

    helper = next(s for s in parsed.symbols if s.name == "helper")
    assert helper.kind == SymbolKind.METHOD
    assert helper.api is None


def test_every_method_annotation_is_recorded_regardless_of_recognition():
    source = (
        "public class OrderController {\n"
        "    @PostMapping(\"/orders\")\n"
        "    @PreAuthorize(\"hasRole('ADMIN')\")\n"
        "    @Transactional\n"
        "    public Order create() { return null; }\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("OrderController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "create")
    names = [m.name for m in handler.api.middleware_chain]
    assert any("PreAuthorize" in n for n in names)
    assert any("Transactional" in n for n in names)
    pre_authorize_step = next(m for m in handler.api.middleware_chain if "PreAuthorize" in m.name)
    assert "ADMIN" in pre_authorize_step.detail
    transactional_step = next(m for m in handler.api.middleware_chain if "Transactional" in m.name)
    assert transactional_step.detail is None  # not an auth/role annotation - recorded, not guessed


def test_request_header_param_is_classified():
    source = (
        "public class OrderController {\n"
        "    @GetMapping(\"/orders\")\n"
        "    public Order get(@RequestHeader String authorization) {\n"
        "        return null;\n"
        "    }\n"
        "}\n"
    )
    parsed, _ = JavaFileParser("repo1").parse("OrderController.java", source)

    handler = next(s for s in parsed.symbols if s.name == "get")
    param = next(p for p in handler.api.request_params if p.name == "authorization")
    assert param.location == "header"
