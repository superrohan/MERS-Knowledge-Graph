"""Tree-sitter based parser for JavaScript and TypeScript.

Uses the TSX grammar for everything (.js/.jsx/.ts/.tsx) - it's a strict
syntactic superset of plain JS/TS, so one grammar and one walker cover
all four extensions. Produces the same language-neutral ParsedFile shape
as app.parsing.python_parser - see app.parsing.base for the contract.

Known scope limits (documented, not silently skipped): TESTS-relationship
detection (spec's test_ heuristic doesn't translate to JS's
describe/it/test(...) callback style), full generic/union type
resolution for USES, and Express routes registered with an inline
(anonymous) handler function (only named-function handlers are resolved
to an API symbol - see app.parsing.api_detection.express_api) are not
implemented in this first pass.
"""

from __future__ import annotations

import hashlib
import posixpath

import tree_sitter_typescript as tsts
from tree_sitter import Language, Parser

from app.domain.models import ParsedFile, RelationshipType, Symbol, SymbolKind
from app.parsing.api_detection.express_api import (
    build_api_info,
    is_route_registration_call,
    parse_route_registration,
)
from app.parsing.api_detection.network_calls import detect_network_call
from app.parsing.api_detection.route_matching import route_key
from app.parsing.base import UnresolvedReference

_LANGUAGE = Language(tsts.language_tsx())
_parser = Parser(_LANGUAGE)

_EXTENSIONS = (".tsx", ".jsx", ".ts", ".js")
_BUILTIN_TYPES = {
    "number", "string", "boolean", "void", "any", "unknown", "never", "object",
    "null", "undefined", "Array", "Promise", "Record", "Partial", "Omit", "Pick",
}


def module_qualified_name(relative_path: str) -> str:
    without_ext = relative_path
    for ext in _EXTENSIONS:
        if without_ext.endswith(ext):
            without_ext = without_ext[: -len(ext)]
            break
    if without_ext.endswith("/index"):
        without_ext = without_ext[: -len("/index")]
    return without_ext.replace("/", ".")


def symbol_id(repository_id: str, file_path: str, qualified_name: str) -> str:
    return f"{repository_id}::{file_path}::{qualified_name}"


def _resolve_relative_import(current_file_path: str, import_source: str) -> str | None:
    """Resolves "./auth_service" from "src/api/controller.ts" to the dotted
    module name "src.api.auth_service", or None for a bare package
    specifier (external dependency - nothing in this repo to link to)."""
    if not (import_source.startswith("./") or import_source.startswith("../")):
        return None
    current_dir = posixpath.dirname(current_file_path)
    combined = posixpath.normpath(posixpath.join(current_dir, import_source))
    for ext in _EXTENSIONS:
        if combined.endswith(ext):
            combined = combined[: -len(ext)]
            break
    return combined.replace("/", ".")


class JavaScriptFileParser:
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

        walker = _Walker(self, relative_path, module_qname, module_id, source_bytes, parsed, unresolved)
        walker.walk_module(tree.root_node)
        self._resolve_route_registrations(walker.route_registrations, parsed, source_bytes)

        return parsed, unresolved

    def _resolve_route_registrations(self, routes: list[dict], parsed: ParsedFile, source_bytes: bytes) -> None:
        """Only named-function handlers are resolved here - see the
        module docstring for why inline handlers are a known gap."""
        for route in routes:
            handler_node = route["handler_node"]
            if handler_node.type != "identifier":
                continue
            handler_name = _text(handler_node, source_bytes)
            matches = [
                s for s in parsed.symbols if s.name == handler_name and s.kind in (SymbolKind.FUNCTION, SymbolKind.METHOD)
            ]
            if len(matches) != 1:
                continue
            matches[0].kind = SymbolKind.API
            matches[0].api = build_api_info(route, matches[0], source_bytes)


# TypeScript and JavaScript share one grammar/walker here.
TypeScriptFileParser = JavaScriptFileParser


def _text(node, source_bytes: bytes) -> str:
    return source_bytes[node.start_byte : node.end_byte].decode("utf-8", errors="replace")


def _find_first(node, types: set[str]):
    if node.type in types:
        return node
    for child in node.children:
        found = _find_first(child, types)
        if found is not None:
            return found
    return None


def _annotation_type_name(type_annotation_node, source_bytes: bytes) -> str | None:
    inner = _find_first(type_annotation_node, {"type_identifier"})
    if inner is None:
        return None
    name = _text(inner, source_bytes)
    return None if name in _BUILTIN_TYPES else name


class _Walker:
    def __init__(self, parser, file_path, module_qname, module_id, source_bytes, parsed, unresolved):
        self.repository_id = parser.repository_id
        self.file_path = file_path
        self.module_qname = module_qname
        self.module_id = module_id
        self.source_bytes = source_bytes
        self.parsed = parsed
        self.unresolved = unresolved
        self.route_registrations: list[dict] = []

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

        if node_type in ("import_statement",):
            self._handle_import(node, enclosing_id)
            return

        if node_type == "export_statement":
            # `export class X {}` / `export function f() {}` / `export const x = ...`
            # wrap the real declaration as a named child - unwrap and recurse.
            for child in node.named_children:
                self._visit(child, enclosing_id, class_qname)
            return

        if node_type in ("class_declaration", "abstract_class_declaration"):
            self._handle_class(node, enclosing_id)
            return

        if node_type == "interface_declaration":
            self._handle_interface(node, enclosing_id)
            return

        if node_type == "function_declaration":
            self._handle_function(node, enclosing_id, class_qname, name_node=node.child_by_field_name("name"))
            return

        if node_type in ("lexical_declaration", "variable_declaration"):
            self._handle_variable_declaration(node, enclosing_id, class_qname)
            return

        if node_type == "call_expression":
            self._handle_call(node, enclosing_id)
            # fall through to also scan arguments for nested calls

        for child in node.children:
            self._visit(child, enclosing_id, class_qname)

    def _handle_import(self, node, enclosing_id: str) -> None:
        source_node = node.child_by_field_name("source")
        if source_node is None:
            return
        raw_source = _text(source_node, self.source_bytes).strip("'\"")
        self.parsed.imports.append(raw_source)

        resolved_module = _resolve_relative_import(self.file_path, raw_source)
        if resolved_module:
            self.unresolved.append(UnresolvedReference(enclosing_id, resolved_module, RelationshipType.IMPORTS))

        for identifier in _find_all(node, {"import_specifier"}):
            name_node = identifier.child_by_field_name("name") or _find_first(identifier, {"identifier"})
            if name_node is not None:
                self.unresolved.append(
                    UnresolvedReference(enclosing_id, _text(name_node, self.source_bytes), RelationshipType.IMPORTS)
                )

        clause = node.child_by_field_name("import_clause") or next(
            (c for c in node.named_children if c.type == "import_clause"), None
        )
        if clause is not None:
            for child in clause.named_children:
                if child.type == "identifier":  # default import
                    self.unresolved.append(
                        UnresolvedReference(enclosing_id, _text(child, self.source_bytes), RelationshipType.IMPORTS)
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
            )
        )
        self._define(enclosing_id, class_id)

        heritage = next((c for c in node.children if c.type == "class_heritage"), None)
        if heritage is not None:
            base = _find_first(heritage, {"identifier", "type_identifier"})
            if base is not None:
                base_name = _text(base, self.source_bytes)
                self.unresolved.append(UnresolvedReference(class_id, base_name, RelationshipType.EXTENDS))

        if body is not None:
            for child in body.named_children:
                if child.type in ("method_definition", "public_field_definition"):
                    if child.type == "method_definition":
                        self._handle_function(
                            child, class_id, class_qname, name_node=child.child_by_field_name("name")
                        )

    def _handle_interface(self, node, enclosing_id: str) -> None:
        name_node = node.child_by_field_name("name")
        if name_node is None:
            return
        name = _text(name_node, self.source_bytes)
        qname = f"{self.module_qname}.{name}"
        symbol_id_ = self._id(qname)
        self.parsed.symbols.append(
            Symbol(
                id=symbol_id_,
                repository_id=self.repository_id,
                kind=SymbolKind.CLASS,
                name=name,
                qualified_name=qname,
                file_path=self.file_path,
                start_line=node.start_point[0] + 1,
                end_line=node.end_point[0] + 1,
            )
        )
        self._define(enclosing_id, symbol_id_)

    def _handle_variable_declaration(self, node, enclosing_id: str, class_qname: str | None) -> None:
        for declarator in node.named_children:
            if declarator.type != "variable_declarator":
                continue
            name_node = declarator.child_by_field_name("name")
            value_node = declarator.child_by_field_name("value")
            if name_node is None or value_node is None:
                continue
            if value_node.type in ("arrow_function", "function_expression"):
                self._handle_function(value_node, enclosing_id, class_qname, name_node=name_node, decl_node=node)
            else:
                self._visit(value_node, enclosing_id, class_qname)

    def _handle_function(self, node, enclosing_id: str, class_qname: str | None, name_node, decl_node=None) -> None:
        if name_node is None:
            return
        func_name = _text(name_node, self.source_bytes)
        is_method = class_qname is not None
        func_qname = f"{class_qname}.{func_name}" if is_method else f"{self.module_qname}.{func_name}"
        func_id = self._id(func_qname)
        body = node.child_by_field_name("body")
        span_node = decl_node or node

        self.parsed.symbols.append(
            Symbol(
                id=func_id,
                repository_id=self.repository_id,
                kind=SymbolKind.METHOD if is_method else SymbolKind.FUNCTION,
                name=func_name,
                qualified_name=func_qname,
                file_path=self.file_path,
                start_line=span_node.start_point[0] + 1,
                end_line=span_node.end_point[0] + 1,
            )
        )
        self._define(enclosing_id, func_id)
        self._handle_type_annotations(node, func_id)

        if body is not None:
            if body.type == "statement_block":
                self._walk_statements(body, enclosing_id=func_id, class_qname=None)
            else:
                self._visit(body, enclosing_id=func_id, class_qname=None)

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
            type_node = param.child_by_field_name("type")
            if type_node is None:
                continue
            name = _annotation_type_name(type_node, self.source_bytes)
            if name:
                self.unresolved.append(UnresolvedReference(func_id, name, RelationshipType.USES))

    def _handle_call(self, node, enclosing_id: str) -> None:
        if is_route_registration_call(node, self.source_bytes):
            route = parse_route_registration(node, self.source_bytes)
            if route is not None:
                self.route_registrations.append(route)
            return  # not a real CALLS edge - it's a route registration

        network_call = detect_network_call(node, self.source_bytes)
        if network_call is not None:
            method, path = network_call
            self.unresolved.append(
                UnresolvedReference(enclosing_id, route_key(method, path), RelationshipType.CALLS_API)
            )
            return  # not a real CALLS edge either - it's a network call to a (possibly cross-repo) API

        fn = node.child_by_field_name("function")
        if fn is None:
            return
        if fn.type == "identifier":
            name = _text(fn, self.source_bytes)
        elif fn.type == "member_expression":
            prop = fn.child_by_field_name("property")
            name = _text(prop, self.source_bytes) if prop is not None else None
        else:
            name = None
        if name:
            self.unresolved.append(UnresolvedReference(enclosing_id, name, RelationshipType.CALLS))


def _find_all(node, types: set[str]):
    results = []

    def _walk(n):
        if n.type in types:
            results.append(n)
        for c in n.children:
            _walk(c)

    _walk(node)
    return results
