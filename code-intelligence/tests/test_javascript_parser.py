from app.domain.models import RelationshipType, SymbolKind
from app.parsing.javascript_parser import JavaScriptFileParser, module_qualified_name


def test_module_qualified_name():
    assert module_qualified_name("src/services/authService.js") == "src.services.authService"
    assert module_qualified_name("src/index.ts") == "src"
    assert module_qualified_name("src/api/controller.tsx") == "src.api.controller"


def test_parses_class_and_method_symbols():
    source = (
        "class AuthService {\n"
        "  authenticate(username, password) {\n"
        "    const user = this.repository.find(username);\n"
        "    return this.jwtValidator.issue(user.id);\n"
        "  }\n"
        "}\n"
    )
    parsed, unresolved = JavaScriptFileParser("repo1").parse("src/services/authService.js", source)

    kinds = {s.qualified_name: s.kind for s in parsed.symbols}
    assert kinds["src.services.authService"] == SymbolKind.MODULE
    assert kinds["src.services.authService.AuthService"] == SymbolKind.CLASS
    assert kinds["src.services.authService.AuthService.authenticate"] == SymbolKind.METHOD

    call_targets = {u.target_name for u in unresolved if u.type == RelationshipType.CALLS}
    assert "find" in call_targets
    assert "issue" in call_targets


def test_defines_relationships_connect_module_class_method():
    source = "class Foo {\n  bar() {}\n}\n"
    parsed, _ = JavaScriptFileParser("repo1").parse("foo.js", source)

    defines = {(r.source_id, r.target_id) for r in parsed.relationships}
    module_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.MODULE)
    class_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.CLASS)
    method_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.METHOD)

    assert (module_id, class_id) in defines
    assert (class_id, method_id) in defines


def test_extends_relationship_is_unresolved_by_base_name():
    source = "class Child extends Base {\n}\n"
    _, unresolved = JavaScriptFileParser("repo1").parse("foo.js", source)

    extends = [u for u in unresolved if u.type == RelationshipType.EXTENDS]
    assert len(extends) == 1
    assert extends[0].target_name == "Base"


def test_named_imports_are_collected():
    source = "import { AuthService } from '../services/authService.js';\n"
    parsed, unresolved = JavaScriptFileParser("repo1").parse("src/api/controller.js", source)

    assert "../services/authService.js" in parsed.imports
    import_targets = {u.target_name for u in unresolved if u.type == RelationshipType.IMPORTS}
    assert "AuthService" in import_targets
    assert "src.services.authService" in import_targets  # resolved relative module path


def test_bare_package_import_has_no_module_target():
    source = "import express from 'express';\n"
    parsed, unresolved = JavaScriptFileParser("repo1").parse("src/api/controller.js", source)

    assert "express" in parsed.imports
    import_targets = {u.target_name for u in unresolved if u.type == RelationshipType.IMPORTS}
    assert import_targets == {"express"}  # default import name only, no resolved module path


def test_top_level_function_is_kind_function_not_method():
    source = "function helper(x) {\n  return x;\n}\n"
    parsed, _ = JavaScriptFileParser("repo1").parse("foo.js", source)
    helper = next(s for s in parsed.symbols if s.name == "helper")
    assert helper.kind == SymbolKind.FUNCTION


def test_arrow_function_assigned_to_const_is_a_function_symbol():
    source = "const helper = (x) => {\n  return doWork(x);\n};\n"
    parsed, unresolved = JavaScriptFileParser("repo1").parse("foo.js", source)

    helper = next((s for s in parsed.symbols if s.name == "helper"), None)
    assert helper is not None
    assert helper.kind == SymbolKind.FUNCTION
    calls = {u.target_name for u in unresolved if u.type == RelationshipType.CALLS}
    assert "doWork" in calls


def test_calls_are_scoped_to_the_innermost_function():
    source = (
        "function outer() {\n"
        "  function inner() {\n"
        "    helperInInner();\n"
        "  }\n"
        "  helperInOuter();\n"
        "}\n"
    )
    parsed, unresolved = JavaScriptFileParser("repo1").parse("foo.js", source)

    outer_id = next(s.id for s in parsed.symbols if s.name == "outer")
    inner_id = next(s.id for s in parsed.symbols if s.name == "inner")

    calls = {(u.source_id, u.target_name) for u in unresolved if u.type == RelationshipType.CALLS}
    assert (inner_id, "helperInInner") in calls
    assert (outer_id, "helperInOuter") in calls
    assert (outer_id, "helperInInner") not in calls


def test_typescript_type_annotations_produce_uses_references():
    source = "function handle(repo: UserRepository): AuthService {\n  return null;\n}\n"
    _, unresolved = JavaScriptFileParser("repo1").parse("foo.ts", source)

    uses = {u.target_name for u in unresolved if u.type == RelationshipType.USES}
    assert uses == {"UserRepository", "AuthService"}


def test_builtin_type_annotations_are_not_treated_as_uses():
    source = "function handle(count: number): string {\n  return '';\n}\n"
    _, unresolved = JavaScriptFileParser("repo1").parse("foo.ts", source)

    uses = [u for u in unresolved if u.type == RelationshipType.USES]
    assert uses == []


def test_typescript_interface_is_a_class_kind_symbol():
    source = "interface Config {\n  apiKey: string;\n}\n"
    parsed, _ = JavaScriptFileParser("repo1").parse("foo.ts", source)
    config = next(s for s in parsed.symbols if s.name == "Config")
    assert config.kind == SymbolKind.CLASS
