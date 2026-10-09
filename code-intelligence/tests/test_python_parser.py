from app.domain.models import RelationshipType, SymbolKind
from app.parsing.python_parser import PythonFileParser, module_qualified_name


def test_module_qualified_name():
    assert module_qualified_name("src/services/auth_service.py") == "src.services.auth_service"
    assert module_qualified_name("src/__init__.py") == "src"


def test_parses_class_and_method_symbols():
    source = (
        "class AuthService:\n"
        "    def authenticate(self, username, password):\n"
        "        user = self.repository.find(username)\n"
        "        return self.jwt_validator.issue(user.user_id)\n"
    )
    parsed, unresolved = PythonFileParser("repo1").parse("src/services/auth_service.py", source)

    kinds = {s.qualified_name: s.kind for s in parsed.symbols}
    assert kinds["src.services.auth_service"] == SymbolKind.MODULE
    assert kinds["src.services.auth_service.AuthService"] == SymbolKind.CLASS
    assert kinds["src.services.auth_service.AuthService.authenticate"] == SymbolKind.METHOD

    call_targets = {u.target_name for u in unresolved if u.type == RelationshipType.CALLS}
    assert "find" in call_targets
    assert "issue" in call_targets


def test_defines_relationships_connect_module_class_method():
    source = "class Foo:\n    def bar(self):\n        pass\n"
    parsed, _ = PythonFileParser("repo1").parse("foo.py", source)

    defines = {(r.source_id, r.target_id) for r in parsed.relationships}
    module_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.MODULE)
    class_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.CLASS)
    method_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.METHOD)

    assert (module_id, class_id) in defines
    assert (class_id, method_id) in defines


def test_extends_relationship_is_unresolved_by_base_name():
    source = "class Child(Base):\n    pass\n"
    _, unresolved = PythonFileParser("repo1").parse("foo.py", source)

    extends = [u for u in unresolved if u.type == RelationshipType.EXTENDS]
    assert len(extends) == 1
    assert extends[0].target_name == "Base"


def test_imports_are_collected():
    source = "import os\nfrom src.services.auth_service import AuthService\n"
    parsed, unresolved = PythonFileParser("repo1").parse("foo.py", source)

    assert "os" in parsed.imports
    assert "src.services.auth_service" in parsed.imports
    import_targets = {u.target_name for u in unresolved if u.type == RelationshipType.IMPORTS}
    assert "src.services.auth_service" in import_targets


def test_top_level_function_is_kind_function_not_method():
    source = "def helper(x):\n    return x\n"
    parsed, _ = PythonFileParser("repo1").parse("foo.py", source)
    helper = next(s for s in parsed.symbols if s.name == "helper")
    assert helper.kind == SymbolKind.FUNCTION


def test_test_function_produces_tests_reference():
    source = "def test_authenticate_returns_token():\n    pass\n"
    _, unresolved = PythonFileParser("repo1").parse("tests/test_auth_service.py", source)

    tests_refs = [u for u in unresolved if u.type == RelationshipType.TESTS]
    assert len(tests_refs) == 1
    assert tests_refs[0].target_name == "authenticate_returns_token"


def test_type_annotations_produce_uses_references():
    source = "def handle(repo: UserRepository) -> AuthService:\n    pass\n"
    _, unresolved = PythonFileParser("repo1").parse("foo.py", source)

    uses = {u.target_name for u in unresolved if u.type == RelationshipType.USES}
    assert uses == {"UserRepository", "AuthService"}


def test_builtin_type_annotations_are_not_treated_as_uses():
    source = "def handle(count: int) -> str:\n    pass\n"
    _, unresolved = PythonFileParser("repo1").parse("foo.py", source)

    uses = [u for u in unresolved if u.type == RelationshipType.USES]
    assert uses == []


def test_calls_are_scoped_to_the_innermost_function():
    source = (
        "def outer():\n"
        "    def inner():\n"
        "        helper_in_inner()\n"
        "    helper_in_outer()\n"
    )
    parsed, unresolved = PythonFileParser("repo1").parse("foo.py", source)

    outer_id = next(s.id for s in parsed.symbols if s.name == "outer")
    inner_id = next(s.id for s in parsed.symbols if s.name == "inner")

    calls = {(u.source_id, u.target_name) for u in unresolved if u.type == RelationshipType.CALLS}
    assert (inner_id, "helper_in_inner") in calls
    assert (outer_id, "helper_in_outer") in calls
    assert (outer_id, "helper_in_inner") not in calls
