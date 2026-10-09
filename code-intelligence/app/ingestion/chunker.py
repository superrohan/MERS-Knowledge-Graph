"""Splits parsed symbols into semantic code chunks for embedding/retrieval.

One chunk per class/function/method by default; symbols longer than
`max_lines_per_chunk` are split into consecutive sub-chunks so no single
chunk is too large to embed or cite meaningfully.
"""

from __future__ import annotations

from app.domain.models import CodeChunk, Symbol, SymbolKind

_MAX_LINES_PER_CHUNK = 60


def chunk_symbol(repository_id: str, symbol: Symbol, source_lines: list[str]) -> list[CodeChunk]:
    if symbol.kind == SymbolKind.MODULE:
        return []

    start_idx = symbol.start_line - 1
    end_idx = symbol.end_line
    lines = source_lines[start_idx:end_idx]
    if not lines:
        return []

    chunks: list[CodeChunk] = []
    for offset in range(0, len(lines), _MAX_LINES_PER_CHUNK):
        sub_lines = lines[offset : offset + _MAX_LINES_PER_CHUNK]
        start_line = symbol.start_line + offset
        end_line = start_line + len(sub_lines) - 1
        chunk_id = f"chunk::{symbol.id}::{start_line}-{end_line}"
        chunks.append(
            CodeChunk(
                id=chunk_id,
                repository_id=repository_id,
                file_path=symbol.file_path,
                start_line=start_line,
                end_line=end_line,
                text="\n".join(sub_lines),
                symbol_id=symbol.id,
                symbol_name=symbol.qualified_name,
            )
        )
    return chunks
