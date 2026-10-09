"""The contract every language parser implements.

A parser turns one file's source text into a language-neutral
ParsedFile (symbols + DEFINES relationships resolvable within that file
alone) plus a list of UnresolvedReference - names the file *refers to*
(calls, base classes, imports, uses, tests) that can only be resolved
once every file in the repository has been parsed, by GraphBuilder.

Every language parser (PythonFileParser, JavaScriptFileParser,
JavaFileParser, ...) implements exactly this shape, which is what makes
adding a language a matter of writing one new class - nothing above the
parsing layer (graph building, chunking, embeddings, retrieval, the
Node/React layers) needs to change.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

from app.domain.models import ParsedFile, RelationshipType


@dataclass
class UnresolvedReference:
    source_id: str
    target_name: str
    type: RelationshipType


class LanguageParser(Protocol):
    def __init__(self, repository_id: str) -> None: ...

    def parse(self, relative_path: str, source: str) -> tuple[ParsedFile, list[UnresolvedReference]]: ...
