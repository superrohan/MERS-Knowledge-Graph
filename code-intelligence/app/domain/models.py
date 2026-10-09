"""Language-neutral intermediate representation (IR).

Every layer above parsing (graph building, chunking, retrieval) works only
with these types. Nothing outside app/parsing knows about tree-sitter.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum

from app.domain.api_models import ApiEndpointInfo


class SymbolKind(str, Enum):
    MODULE = "MODULE"
    CLASS = "CLASS"
    FUNCTION = "FUNCTION"
    METHOD = "METHOD"
    API = "API"


class RelationshipType(str, Enum):
    CALLS = "CALLS"
    IMPORTS = "IMPORTS"
    EXTENDS = "EXTENDS"
    DEFINES = "DEFINES"
    USES = "USES"
    TESTS = "TESTS"
    HANDLES = "HANDLES"  # API endpoint -> the function/method that handles it
    CALLS_API = "CALLS_API"  # a network call (fetch/axios/...) -> the API endpoint it targets, possibly cross-repo


@dataclass
class Symbol:
    id: str
    repository_id: str
    kind: SymbolKind
    name: str
    qualified_name: str
    file_path: str
    start_line: int
    end_line: int
    docstring: str | None = None
    api: ApiEndpointInfo | None = None

    def to_dict(self) -> dict:
        base = {
            "id": self.id,
            "repositoryId": self.repository_id,
            "kind": self.kind.value,
            "name": self.name,
            "qualifiedName": self.qualified_name,
            "filePath": self.file_path,
            "startLine": self.start_line,
            "endLine": self.end_line,
            "docstring": self.docstring,
        }
        if self.api is not None:
            base["api"] = self.api.to_dict()
        return base


@dataclass
class Relationship:
    id: str
    repository_id: str
    source_id: str
    target_id: str
    type: RelationshipType

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "repositoryId": self.repository_id,
            "sourceId": self.source_id,
            "targetId": self.target_id,
            "type": self.type.value,
        }


@dataclass
class CodeChunk:
    id: str
    repository_id: str
    file_path: str
    start_line: int
    end_line: int
    text: str
    symbol_id: str | None = None
    symbol_name: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "repositoryId": self.repository_id,
            "filePath": self.file_path,
            "startLine": self.start_line,
            "endLine": self.end_line,
            "symbolId": self.symbol_id,
            "symbolName": self.symbol_name,
        }


@dataclass
class ParsedFile:
    """The output of parsing a single file: its symbols and the
    relationships that could be resolved *within this file alone*
    (imports, extends, calls, defines). Cross-file call/extends targets
    are resolved afterwards by the GraphBuilder once every file in the
    repository has been parsed.
    """

    file_path: str
    symbols: list[Symbol] = field(default_factory=list)
    relationships: list[Relationship] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)
    content_hash: str = ""
    # Global Spring Security URL-pattern rules found in this file, if any
    # (see app.parsing.api_detection.spring_security_config) - collected
    # across every file in the repository and merged into the
    # already-detected routes they match by
    # app.services.spring_security_merger, since the config class and the
    # routes it governs usually live in different files.
    security_rules: list[dict] = field(default_factory=list)
