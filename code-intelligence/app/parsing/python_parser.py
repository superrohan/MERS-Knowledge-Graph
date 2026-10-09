"""Tree-sitter based parser for Python source files.

Produces a language-neutral ParsedFile (app.domain.models): symbols for
modules/classes/functions/methods, DEFINES relationships (resolvable
within a single file), and a list of *unresolved* references (calls,
base classes, imports, test-to-symbol guesses) that GraphBuilder resolves
once every file in the repository has been parsed.
"""

from __future__ import annotations

import hashlib

import tree_sitter_python as tspython
from tree_sitter import Language, Parser

from app.domain.models import ParsedFile, RelationshipType, Symbol, SymbolKind
from app.parsing.api_detection.python_api import detect_api_endpoint, extract_decorators
from app.parsing.base import UnresolvedReference  # re-exported for existing importers

_LANGUAGE = Language(tspython.language())
_parser = Parser(_LANGUAGE)


def module_qualified_name(relative_path: str) -> str:
    """"src/services/auth_service.py" -> "src.services.auth_service" """
    without_ext = relative_path[:-3] if relative_path.endswith(".py") else relative_path
    without_init = without_ext[: -len("/__init__")] if without_ext.endswith("/__init__") else without_ext
    return without_init.replace("/", ".")


def symbol_id(repository_id: str, file_path: str, qualified_name: str) -> str:
    return f"{repository_id}::{file_path}::{qualified_name}"


class PythonFileParser:
    def __init__(self, repository_id: str):
        self.repository_id = repository_id

    def parse(self, relative_path: str, source: str) -> tuple[ParsedFile, list[UnresolvedReference]]:
        module_qname = module_qualified_name(relative_path)
        module_id = symbol_id(self.repository_id, relative_path, module_qname)

        parsed = ParsedFile(
            file_path=relative_path,
            content_hash=hashlib.sha256(source.encode("utf-8", errors="replace")).hexdigest(),
        )
        parsed.symbols.append(
            Symbol(
                id=module_id,
                repository_id=self.repository_id,
                kind=SymbolKind.MODULE,
                name=relative_path.rsplit("/", 1)[-1],
                qualified_name=module_qname,
                file_path=relative_path,
                start_line=1,
                end_line=source.count("\n") + 1,
            )
        )

        unresolved: list[UnresolvedReference] = []
        source_bytes = source.encode("utf-8", errors="replace")
        tree = _parser.parse(source_bytes)

        _Walker(self, relative_path, module_qname, module_id, source_bytes, parsed, unresolved).walk_module(
            tree.root_node
        )

        return parsed, unresolved


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _docstring(block_node, source_bytes: bytes) -> str | None:
    if block_node is None or block_node.child_count == 0:
        return None
    first = block_node.children[0]
    if first.type == "expression_statement" and first.child_count > 0 and first.children[0].type == "string":
        raw = _text(first.children[0], source_bytes).strip("\"'rRbBfF \n")
        return raw[:500] if raw else None
    return None


class _Walker:
    """Walks a module's syntax tree, tracking the current enclosing symbol
    so calls/uses are attributed to the innermost function or method."""

    def __init__(self, parser: PythonFileParser, file_path, module_qname, module_id, source_bytes, parsed, unresolved):
        self.parser = parser
        self.repository_id = parser.repository_id
        self.file_path = file_path
        self.module_qname = module_qname
        self.module_id = module_id
        self.source_bytes = source_bytes
        self.parsed = parsed
        self.unresolved = unresolved

    def _id(self, qname: str) -> str:
        return symbol_id(self.repository_id, self.file_path, qname)

    def _define(self, source_id: str, target_id: str) -> None:
        from app.domain.models import Relationship

        self.parsed.relationships.append(
            Relationship(
                id=f"rel::{source_id}::DEFINES::{target_id}",
                repository_id=self.repository_id,
                source_id=source_id,
                target_id=target_id,
                type=RelationshipType.DEFINES,
            )
        )

    def walk_module(self, root_node) -> None:
        self._walk_statements(root_node, enclosing_id=self.module_id, class_qname=None)

    def _walk_statements(self, node, enclosing_id: str, class_qname: str | None) -> None:
        for child in node.children:
            self._visit(child, enclosing_id, class_qname)

    def _visit(self, node, enclosing_id: str, class_qname: str | None) -> None:
        node_type = node.type

        if node_type in ("import_statement", "import_from_statement"):
            self._handle_import(node, enclosing_id)
            return

        if node_type == "class_definition":
            self._handle_class(node, enclosing_id)
            return

        if node_type == "function_definition":
            self._handle_function(node, enclosing_id, class_qname)
            return

        if node_type == "decorated_definition":
            inner = next((c for c in node.children if c.type in ("function_definition", "class_definition")), None)
            if inner is None:
                return
            decorators = extract_decorators(node, self.source_bytes)
            if inner.type == "class_definition":
                self._handle_class(inner, enclosing_id)
            else:
                self._handle_function(inner, enclosing_id, class_qname, decorators=decorators)
            return

        if node_type == "call":
            self._handle_call(node, enclosing_id)
            # Fall through: also scan arguments for nested calls.

        # Recurse into any other statement/expression container so calls
        # and imports nested in if/for/try/with/expressions are found.
        for child in node.children:
            self._visit(child, enclosing_id, class_qname)

    def _handle_import(self, node, enclosing_id: str) -> None:
        for dotted in _find_named(node, "dotted_name"):
            module_name = _text(dotted, self.source_bytes)
            self.parsed.imports.append(module_name)
            self.unresolved.append(UnresolvedReference(enclosing_id, module_name, RelationshipType.IMPORTS))
        # `import x` (no dotted_name wrapper, plain identifier) and
        # `from . import x` (relative, dotted_name may be absent).
        if node.type == "import_statement":
            for child in node.named_children:
                if child.type == "aliased_import":
                    name_node = child.child_by_field_name("name")
                    if name_node is not None:
                        module_name = _text(name_node, self.source_bytes)
                        self.parsed.imports.append(module_name)
                        self.unresolved.append(
                            UnresolvedReference(enclosing_id, module_name, RelationshipType.IMPORTS)
                        )

    def _handle_class(self, node, enclosing_id: str) -> None:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return
        class_name = _text(name_node, self.source_bytes)
        class_qname = f"{self.module_qname}.{class_name}"
        class_id = self._id(class_qname)
        body = node.child_by_field_name("body")

        self.parsed.symbols.append(
            Symbol(
                id=class_id,
                repository_id=self.repository_id,
                kind=SymbolKind.CLASS,
                name=class_name,
                qualified_name=class_qname,
                file_path=self.file_path,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
                docstring=_docstring(body, self.source_bytes),
            )
        )
        self._define(enclosing_id, class_id)

        superclasses = node.child_by_field_name("superclasses")
        if superclasses is not None:
            for base in superclasses.named_children:
                base_name = _text(base, self.source_bytes)
                if base_name and base_name != "object":
                    self.unresolved.append(UnresolvedReference(class_id, base_name, RelationshipType.EXTENDS))

        if body is not None:
            self._walk_statements(body, enclosing_id=class_id, class_qname=class_qname)

    def _handle_function(self, node, enclosing_id: str, class_qname: str | None, decorators: list[dict] | None = None) -> None:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return
        func_name = _text(name_node, self.source_bytes)
        is_method = class_qname is not None
        func_qname = f"{class_qname}.{func_name}" if is_method else f"{self.module_qname}.{func_name}"
        func_id = self._id(func_qname)
        body = node.child_by_field_name("body")

        api_info = detect_api_endpoint(decorators, node, self.source_bytes) if decorators else None

        self.parsed.symbols.append(
            Symbol(
                id=func_id,
                repository_id=self.repository_id,
                kind=SymbolKind.API if api_info else (SymbolKind.METHOD if is_method else SymbolKind.FUNCTION),
                name=func_name,
                qualified_name=func_qname,
                file_path=self.file_path,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
                docstring=_docstring(body, self.source_bytes),
                api=api_info,
            )
        )
        self._define(enclosing_id, func_id)

        if _is_test(self.file_path, func_name):
            target_hint = func_name[len("test_") :] if func_name.startswith("test_") else func_name
            self.unresolved.append(UnresolvedReference(func_id, target_hint, RelationshipType.TESTS))

        self._handle_type_annotations(node, func_id)

        if body is not None:
            # A function body's calls belong to this function, not its
            # enclosing class/module - nested defs push their own scope.
            self._walk_statements(body, enclosing_id=func_id, class_qname=None)

    def _handle_type_annotations(self, function_node, func_id: str) -> None:
        return_type = function_node.child_by_field_name("return_type")
        if return_type is not None:
            name = _annotation_type_name(return_type, self.source_bytes)
            if name:
                self.unresolved.append(UnresolvedReference(func_id, name, RelationshipType.USES))

        parameters = function_node.child_by_field_name("parameters")
        if parameters is None:
            return
        for param in parameters.named_children:
            if param.type not in ("typed_parameter", "typed_default_parameter"):
                continue
            type_node = param.child_by_field_name("type")
            if type_node is None:
                continue
            name = _annotation_type_name(type_node, self.source_bytes)
            if name:
                self.unresolved.append(UnresolvedReference(func_id, name, RelationshipType.USES))

    def _handle_call(self, node, enclosing_id: str) -> None:
        func_node = node.child_by_field_name("function")
        if func_node is None:
            return
        if func_node.type == "identifier":
            name = _text(func_node, self.source_bytes)
        elif func_node.type == "attribute":
            attr = func_node.child_by_field_name("attribute")
            name = _text(attr, self.source_bytes) if attr is not None else None
        else:
            name = None
        if name:
            self.unresolved.append(UnresolvedReference(enclosing_id, name, RelationshipType.CALLS))


def _find_named(node, type_name: str):
    for child in node.named_children:
        if child.type == type_name:
            yield child


_BUILTIN_TYPES = {
    "int", "str", "bool", "float", "bytes", "object", "None",
    "list", "dict", "set", "tuple", "frozenset",
    "Any", "Optional", "Union", "List", "Dict", "Set", "Tuple", "Callable",
}


def _annotation_type_name(type_node, source_bytes: bytes) -> str | None:
    """Extracts a best-guess base type name from a `type` annotation node,
    e.g. "UserRepository" from `UserRepository`, or "Optional" from
    `Optional[UserRepository]` (the inner arg is not resolved - this is a
    lightweight heuristic, not a full type checker)."""
    node = type_node
    while node is not None and node.named_child_count > 0 and node.type not in ("identifier", "attribute"):
        node = node.named_children[0]
    if node is None:
        return None
    name = _text(node, source_bytes).split(".")[-1]
    return None if name in _BUILTIN_TYPES else name


def _is_test(file_path: str, func_name: str) -> bool:
    in_test_location = "test" in file_path.lower()
    return in_test_location and func_name.startswith("test_")
