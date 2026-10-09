"""Maps a file extension to the language parser that handles it.

Adding a language is: write the parser class, add its extensions here.
Nothing else in the ingestion/indexing pipeline needs to change - see
app.parsing.base for the shared contract.
"""

from __future__ import annotations

_EXTENSION_TO_LANGUAGE = {
    ".py": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".tsx": "typescript",
    ".java": "java",
}


def language_for_extension(extension: str) -> str | None:
    return _EXTENSION_TO_LANGUAGE.get(extension)


def get_parser_class(language: str):
    """Imported lazily so, e.g., importing the registry doesn't require
    every language's tree-sitter grammar to be installed."""
    if language == "python":
        from app.parsing.python_parser import PythonFileParser

        return PythonFileParser
    if language == "javascript":
        from app.parsing.javascript_parser import JavaScriptFileParser

        return JavaScriptFileParser
    if language == "typescript":
        from app.parsing.javascript_parser import TypeScriptFileParser

        return TypeScriptFileParser
    if language == "java":
        from app.parsing.java_parser import JavaFileParser

        return JavaFileParser
    raise ValueError(f"No parser registered for language: {language}")


def supported_extensions() -> set[str]:
    return set(_EXTENSION_TO_LANGUAGE.keys())
