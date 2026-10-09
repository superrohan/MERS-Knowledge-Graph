"""Combines direct symbol-name lookup, vector similarity search, and
bounded graph expansion into one retrieval pass, then hands the result to
EvidenceBuilder for the citations/graphPath shape the query response
needs.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.domain.models import CodeChunk, Relationship, RelationshipType, Symbol, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.retrieval.evidence_builder import EvidenceBuilder
from app.retrieval.graph_retriever import GraphRetriever
from app.retrieval.query_classifier import classify, extract_candidate_identifiers
from app.retrieval.vector_retriever import VectorRetriever

# DEFINES is pure structural containment (module->class->method) - it
# exists in the graph for every symbol, so including it in evidence
# expansion drowns out the actually interesting relationships (CALLS,
# EXTENDS, IMPORTS, USES, TESTS). It's still shown in the full graph
# visualization; just excluded from query evidence.
_EVIDENCE_RELATIONSHIP_TYPES = {
    RelationshipType.CALLS,
    RelationshipType.IMPORTS,
    RelationshipType.EXTENDS,
    RelationshipType.USES,
    RelationshipType.TESTS,
}

# Only the most relevant few chunks seed graph expansion - seeding from
# every top-k vector match dilutes the evidence path with tangential
# structural neighbors of marginally-relevant chunks.
_MAX_CHUNK_SEEDS = 3


@dataclass
class RetrievalResult:
    query_type: str
    chunks: list[tuple[CodeChunk, float]] = field(default_factory=list)
    matched_symbols: list[Symbol] = field(default_factory=list)
    graph_nodes: list[Symbol] = field(default_factory=list)
    graph_edges: list[Relationship] = field(default_factory=list)
    citations: list[dict] = field(default_factory=list)
    graph_path: list[dict] = field(default_factory=list)


class HybridRetriever:
    def __init__(self, graph_store: PostgresGraphStore, vector_retriever: VectorRetriever, graph_retriever: GraphRetriever):
        self.graph_store = graph_store
        self.vector_retriever = vector_retriever
        self.graph_retriever = graph_retriever
        self.evidence_builder = EvidenceBuilder(graph_store)

    def retrieve(self, repository_id: str, query_text: str, top_k: int = 8) -> RetrievalResult:
        classification = classify(query_text)
        candidate_names = extract_candidate_identifiers(query_text)

        matched_symbols = self.graph_retriever.find_named_symbols(repository_id, candidate_names)
        chunks = self.vector_retriever.search(repository_id, query_text, top_k=top_k)

        seed_ids = {s.id for s in matched_symbols}
        seed_ids.update(chunk.symbol_id for chunk, _ in chunks[:_MAX_CHUNK_SEEDS] if chunk.symbol_id)

        graph_nodes, graph_edges = (
            self.graph_retriever.expand(
                repository_id,
                seed_ids,
                direction=classification["direction"],
                hops=2,
                relationship_types=_EVIDENCE_RELATIONSHIP_TYPES,
            )
            if seed_ids
            else ([], [])
        )

        citations = self.evidence_builder.build_citations(repository_id, chunks)

        # API endpoints matched directly by name (see find_named_symbols
        # above) - most notably user-declared annotations, which have no
        # source text to chunk/embed and so can never surface via vector
        # search alone. Only add ones not already covered by a chunk
        # citation for the same symbol.
        seen_symbol_ids = {c.get("symbolId") for c in citations}
        api_symbols = [s for s in matched_symbols if s.kind == SymbolKind.API and s.id not in seen_symbol_ids]
        citations.extend(self.evidence_builder.build_symbol_citations(api_symbols))

        graph_path = self.evidence_builder.build_graph_path(repository_id, graph_edges)

        return RetrievalResult(
            query_type=classification["queryType"],
            chunks=chunks,
            matched_symbols=matched_symbols,
            graph_nodes=graph_nodes,
            graph_edges=graph_edges,
            citations=citations,
            graph_path=graph_path,
        )
