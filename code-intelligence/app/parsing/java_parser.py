"""Tree-sitter based parser for Java.

Produces the same language-neutral ParsedFile shape as the Python/JS
parsers - see app.parsing.base for the contract. Unlike file-path-based
module naming (Python/JS), Java symbols are qualified by their actual
`package` declaration, which is what code and imports really reference.

Known scope limits (documented, not silently skipped): no TESTS-
relationship detection (JUnit's @Test annotation isn't wired up yet).
"""

from __future__ import annotations

import hashlib

import tree_sitter_java as tsjava
from tree_sitter import Language, Parser

from app.domain.models import ParsedFile, RelationshipType, Symbol, SymbolKind
from app.parsing.api_detection.spring_api import class_base_path, detect_api_endpoint, extract_annotations
from app.parsing.api_detection.spring_security_config import (
    extract_security_rules,
    is_security_config_class,
)
from app.parsing.base import UnresolvedReference

_LANGUAGE = Language(tsjava.language())
_parser = Parser(_LANGUAGE)

_BUILTIN_TYPES = {
    "void", "int", "long", "short", "byte", "char", "boolean", "float", "double",
    "String", "Object", "Integer", "Long", "Boolean", "List", "Map", "Set", "Optional",
}


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _package_name(root_node, source_bytes: bytes) -> str | None:
    for child in root_node.children:
        if child.type == "package_declaration":
            for c in child.named_children:
                return _text(c, source_bytes)
    return None


def symbol_id(repository_id: str, file_path: str, qualified_name: str) -> str:
    return f"{repository_id}::{file_path}::{qualified_name}"


def _file_path_qualified_name(relative_path: str) -> str:
    """A qualified name for the MODULE (file) symbol itself. Deliberately
    distinct from the package-based FQN used for classes/methods below -
    Java's one-public-class-per-file convention means a file and its
    primary class usually share a name, so the file needs its own
    identity or it would collide with that class's qualified name."""
    without_ext = relative_path.removesuffix(".java")
    return without_ext.replace("/", ".")


class JavaFileParser:
    def __init__(self, repository_id: str):
        self.repository_id = repository_id

    def parse(self, relative_path: str, source: str) -> tuple[ParsedFile, list[UnresolvedReference]]:
        source_bytes = source.encode("utf-8", errors="replace")
        tree = _parser.parse(source_bytes)

        package = _package_name(tree.root_node, source_bytes)
        module_qname = _file_path_qualified_name(relative_path)
        module_id = symbol_id(self.repository_id, relative_path, module_qname)

        parsed = ParsedFile(
            file_path=relative_path,
            content_hash=hashlib.sha256(source_bytes).hexdigest(),
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
        _Walker(self, relative_path, package, module_id, source_bytes, parsed, unresolved).walk_module(
            tree.root_node
        )
        return parsed, unresolved


def _annotation_type_name(type_node, source_bytes: bytes) -> str | None:
    if type_node is None:
        return None
    if type_node.type == "generic_type":
        type_node = type_node.named_children[0] if type_node.named_children else type_node
    name = _text(type_node, source_bytes)
    return None if name in _BUILTIN_TYPES else name


class _Walker:
    def __init__(self, parser, file_path, package, module_id, source_bytes, parsed, unresolved):
        self.repository_id = parser.repository_id
        self.file_path = file_path
        # Top-level (package-scope) qualification for classes declared
        # directly in this file - distinct from the MODULE symbol's own
        # (file-path-based) qualified name. See _file_path_qualified_name.
        self.top_level_qname_prefix = package
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
        self._walk_statements(root_node, enclosing_id=self.module_id, class_qname=None, base_path="")

    def _walk_statements(self, node, enclosing_id: str, class_qname: str | None, base_path: str = "") -> None:
        for child in node.children:
            self._visit(child, enclosing_id, class_qname, base_path)

    def _visit(self, node, enclosing_id: str, class_qname: str | None, base_path: str = "") -> None:
        node_type = node.type

        if node_type == "import_declaration":
            self._handle_import(node, enclosing_id)
            return

        if node_type in ("class_declaration", "interface_declaration", "enum_declaration"):
            self._handle_class(node, enclosing_id, node_type, enclosing_qname=class_qname)
            return

        if node_type in ("method_declaration", "constructor_declaration"):
            self._handle_method(node, enclosing_id, class_qname, base_path)
            return

        if node_type == "method_invocation":
            self._handle_call(node, enclosing_id)

        for child in node.children:
            self._visit(child, enclosing_id, class_qname, base_path)

    def _handle_import(self, node, enclosing_id: str) -> None:
        scoped = next((c for c in node.named_children if c.type in ("scoped_identifier", "identifier")), None)
        if scoped is None:
            return
        full_path = _text(scoped, self.source_bytes)
        self.parsed.imports.append(full_path)
        is_wildcard = any(c.type == "asterisk" for c in node.children)
        if not is_wildcard:
            simple_name = full_path.rsplit(".", 1)[-1]
            self.unresolved.append(UnresolvedReference(enclosing_id, simple_name, RelationshipType.IMPORTS))

    def _handle_class(self, node, enclosing_id: str, node_type: str, enclosing_qname: str | None = None) -> None:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return
        class_name = _text(name_node, self.source_bytes)
        if enclosing_qname:
            class_qname = f"{enclosing_qname}.{class_name}"
        elif self.top_level_qname_prefix:
            class_qname = f"{self.top_level_qname_prefix}.{class_name}"
        else:
            class_qname = class_name
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
            )
        )
        self._define(enclosing_id, class_id)

        superclass = node.child_by_field_name("superclass")
        superclass_name = None
        if superclass is not None and superclass.named_children:
            superclass_name = _text(superclass.named_children[0], self.source_bytes)
            self.unresolved.append(UnresolvedReference(class_id, superclass_name, RelationshipType.EXTENDS))

        interfaces = node.child_by_field_name("interfaces")
        if interfaces is not None:
            for type_list in interfaces.named_children:
                for iface in type_list.named_children:
                    self.unresolved.append(
                        UnresolvedReference(class_id, _text(iface, self.source_bytes), RelationshipType.EXTENDS)
                    )

        class_annotations = extract_annotations(node, self.source_bytes)
        base_path = class_base_path(class_annotations)

        if body is not None and is_security_config_class(class_annotations, superclass_name):
            self.parsed.security_rules.extend(extract_security_rules(body, self.file_path, self.source_bytes))

        if body is not None:
            self._walk_statements(body, enclosing_id=class_id, class_qname=class_qname, base_path=base_path)

    def _handle_method(self, node, enclosing_id: str, class_qname: str | None, base_path: str = "") -> None:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return
        method_name = _text(name_node, self.source_bytes)
        is_method = class_qname is not None
        # Java has no true top-level functions - every method lives in a
        # class/interface/enum - but fall back gracefully if this is ever
        # reached from a malformed parse.
        method_qname = f"{class_qname}.{method_name}" if is_method else method_name
        method_id = self._id(method_qname)
        body = node.child_by_field_name("body")

        method_annotations = extract_annotations(node, self.source_bytes)
        api_info = detect_api_endpoint(method_annotations, node, base_path, self.source_bytes)

        self.parsed.symbols.append(
            Symbol(
                id=method_id,
                repository_id=self.repository_id,
                kind=SymbolKind.API if api_info else (SymbolKind.METHOD if is_method else SymbolKind.FUNCTION),
                name=method_name,
                qualified_name=method_qname,
                file_path=self.file_path,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
                api=api_info,
            )
        )
        self._define(enclosing_id, method_id)
        self._handle_type_annotations(node, method_id)

        if body is not None:
            self._walk_statements(body, enclosing_id=method_id, class_qname=None)

    def _handle_type_annotations(self, method_node, method_id: str) -> None:
        return_type = method_node.child_by_field_name("type")
        name = _annotation_type_name(return_type, self.source_bytes)
        if name:
            self.unresolved.append(UnresolvedReference(method_id, name, RelationshipType.USES))

        parameters = method_node.child_by_field_name("parameters")
        if parameters is None:
            return
        for param in parameters.named_children:
            type_node = param.child_by_field_name("type")
            name = _annotation_type_name(type_node, self.source_bytes)
            if name:
                self.unresolved.append(UnresolvedReference(method_id, name, RelationshipType.USES))

    def _handle_call(self, node, enclosing_id: str) -> None:
        name_node = node.child_by_field_name("name")
        if name_node is not None:
            self.unresolved.append(
                UnresolvedReference(enclosing_id, _text(name_node, self.source_bytes), RelationshipType.CALLS)
            )
