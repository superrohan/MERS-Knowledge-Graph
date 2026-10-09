from __future__ import annotations

from app.domain.models import CodeChunk, Relationship, Symbol
from app.graph.postgres_store import PostgresGraphStore

_MAX_CITATIONS = 8
_MAX_GRAPH_PATH_HOPS = 8


class EvidenceBuilder:
    def __init__(self, graph_store: PostgresGraphStore):
        self.graph_store = graph_store

    def build_citations(self, repository_id: str, chunks_with_scores: list[tuple[CodeChunk, float]]) -> list[dict]:
        citations = []
        seen = set()
        for chunk, score in chunks_with_scores:
            key = (chunk.file_path, chunk.start_line, chunk.end_line)
            if key in seen:
                continue
            seen.add(key)
            citation = {
                "filePath": chunk.file_path,
                "startLine": chunk.start_line,
                "endLine": chunk.end_line,
                "symbolId": chunk.symbol_id,
                "symbolName": chunk.symbol_name,
                "relevance": round(score, 4),
            }
            # Surface extracted API/auth metadata directly on the citation
            # so the answer (and the LLM prompt below) can speak to route,
            # method, and auth/role requirements without a second lookup.
            symbol = self.graph_store.get_symbol(repository_id, chunk.symbol_id) if chunk.symbol_id else None
            if symbol is not None and symbol.api is not None:
                citation["api"] = symbol.api.to_dict()
            citations.append(citation)
            if len(citations) >= _MAX_CITATIONS:
                break
        return citations

    def build_symbol_citations(self, symbols: list[Symbol]) -> list[dict]:
        """Citations built directly from a symbol matched by name (see
        GraphRetriever.find_named_symbols), not from a vector-similarity
        chunk hit. A user-declared API annotation has no source code to
        chunk/embed, so this is the only way it ever reaches the answer
        evidence - name-matched, not vector-matched."""
        citations = []
        for symbol in symbols:
            if symbol.api is None:
                continue
            citations.append(
                {
                    "filePath": symbol.file_path,
                    "startLine": symbol.start_line,
                    "endLine": symbol.end_line,
                    "symbolId": symbol.id,
                    "symbolName": symbol.name,
                    "relevance": None,
                    "api": symbol.api.to_dict(),
                }
            )
        return citations

    def build_graph_path(self, repository_id: str, edges: list[Relationship]) -> list[dict]:
        path = []
        for edge in edges[:_MAX_GRAPH_PATH_HOPS]:
            source = self.graph_store.get_symbol(repository_id, edge.source_id)
            target = self.graph_store.get_symbol(repository_id, edge.target_id)
            if source is None or target is None:
                continue
            path.append({"source": source.qualified_name, "relationship": edge.type.value, "target": target.qualified_name})
        return path
