from app.domain.models import RelationshipType, SymbolKind
from app.parsing.java_parser import JavaFileParser


def test_module_is_file_path_based_and_class_uses_package_declaration():
    source = "package com.example.auth;\n\nclass AuthService {}\n"
    parsed, _ = JavaFileParser("repo1").parse("src/main/java/com/example/auth/AuthService.java", source)

    module = next(s for s in parsed.symbols if s.kind == SymbolKind.MODULE)
    cls = next(s for s in parsed.symbols if s.kind == SymbolKind.CLASS)

    # The file and its one public class share a name by convention, so
    # they must NOT share a qualified_name (that would collide in the
    # graph store's by-qualified-name lookup).
    assert module.qualified_name == "src.main.java.com.example.auth.AuthService"
    assert cls.qualified_name == "com.example.auth.AuthService"
    assert module.qualified_name != cls.qualified_name


def test_parses_class_and_method_symbols():
    source = (
        "package com.example.auth;\n\n"
        "public class AuthService {\n"
        "    public String authenticate(String username) {\n"
        "        User user = repository.find(username);\n"
        "        return jwtValidator.issue(user.getId());\n"
        "    }\n"
        "}\n"
    )
    parsed, unresolved = JavaFileParser("repo1").parse("AuthService.java", source)

    kinds = {s.qualified_name: s.kind for s in parsed.symbols}
    assert kinds["com.example.auth.AuthService"] == SymbolKind.CLASS
    assert kinds["com.example.auth.AuthService.authenticate"] == SymbolKind.METHOD

    call_targets = {u.target_name for u in unresolved if u.type == RelationshipType.CALLS}
    assert "find" in call_targets
    assert "issue" in call_targets
    assert "getId" in call_targets


def test_defines_relationships_connect_module_class_method():
    source = "class Foo {\n  void bar() {}\n}\n"
    parsed, _ = JavaFileParser("repo1").parse("Foo.java", source)

    defines = {(r.source_id, r.target_id) for r in parsed.relationships}
    module_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.MODULE)
    class_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.CLASS)
    method_id = next(s.id for s in parsed.symbols if s.kind == SymbolKind.METHOD)

    assert (module_id, class_id) in defines
    assert (class_id, method_id) in defines


def test_extends_and_implements_are_unresolved_by_name():
    source = "class Child extends Base implements Validator, Cloneable {\n}\n"
    _, unresolved = JavaFileParser("repo1").parse("Child.java", source)

    extends_targets = {u.target_name for u in unresolved if u.type == RelationshipType.EXTENDS}
    assert extends_targets == {"Base", "Validator", "Cloneable"}


def test_imports_use_simple_name_for_resolution():
    source = "import com.example.repository.UserRepository;\n\nclass Foo {}\n"
    parsed, unresolved = JavaFileParser("repo1").parse("Foo.java", source)

    assert "com.example.repository.UserRepository" in parsed.imports
    import_targets = {u.target_name for u in unresolved if u.type == RelationshipType.IMPORTS}
    assert import_targets == {"UserRepository"}


def test_wildcard_imports_produce_no_unresolved_reference():
    source = "import org.springframework.web.bind.annotation.*;\n\nclass Foo {}\n"
    parsed, unresolved = JavaFileParser("repo1").parse("Foo.java", source)

    assert "org.springframework.web.bind.annotation" in parsed.imports
    assert [u for u in unresolved if u.type == RelationshipType.IMPORTS] == []


def test_type_annotations_produce_uses_references():
    source = "class Foo {\n  AuthService handle(UserRepository repo) { return null; }\n}\n"
    _, unresolved = JavaFileParser("repo1").parse("Foo.java", source)

    uses = {u.target_name for u in unresolved if u.type == RelationshipType.USES}
    assert uses == {"AuthService", "UserRepository"}


def test_builtin_type_annotations_are_not_treated_as_uses():
    source = "class Foo {\n  String handle(int count) { return \"\"; }\n}\n"
    _, unresolved = JavaFileParser("repo1").parse("Foo.java", source)

    uses = [u for u in unresolved if u.type == RelationshipType.USES]
    assert uses == []


def test_calls_are_scoped_to_the_innermost_method():
    source = (
        "class Foo {\n"
        "  void outer() {\n"
        "    helperInOuter();\n"
        "  }\n"
        "  void other() {\n"
        "    helperInOther();\n"
        "  }\n"
        "}\n"
    )
    parsed, unresolved = JavaFileParser("repo1").parse("Foo.java", source)

    outer_id = next(s.id for s in parsed.symbols if s.name == "outer")
    other_id = next(s.id for s in parsed.symbols if s.name == "other")

    calls = {(u.source_id, u.target_name) for u in unresolved if u.type == RelationshipType.CALLS}
    assert (outer_id, "helperInOuter") in calls
    assert (other_id, "helperInOther") in calls
    assert (outer_id, "helperInOther") not in calls
