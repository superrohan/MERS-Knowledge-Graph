from __future__ import annotations

from app.domain.models import Relationship, Symbol
from app.graph.postgres_store import PostgresGraphStore

_MAX_GRAPH_NODES = 40


class GraphRetriever:
    def __init__(self, graph_store: PostgresGraphStore):
        self.graph_store = graph_store

    def find_named_symbols(self, repository_id: str, names: list[str]) -> list[Symbol]:
        seen: dict[str, Symbol] = {}
        for name in names:
            for symbol in self.graph_store.find_by_simple_name(repository_id, name):
                seen[symbol.id] = symbol
        return list(seen.values())

    def expand(
        self,
        repository_id: str,
        seed_symbol_ids: set[str],
        direction: str = "out",
        hops: int = 2,
        relationship_types: set | None = None,
    ) -> tuple[list[Symbol], list[Relationship]]:
        """Bounded subgraph expansion from a set of seed symbols - never
        renders/returns the whole graph (spec §22)."""
        nodes: dict[str, Symbol] = {}
        edges: dict[str, Relationship] = {}

        for seed_id in seed_symbol_ids:
            found_nodes, found_edges = self.graph_store.neighbors(
                repository_id, seed_id, direction=direction, hops=hops, relationship_types=relationship_types
            )
            for node in found_nodes:
                nodes[node.id] = node
            for edge in found_edges:
                edges[edge.id] = edge
            if len(nodes) >= _MAX_GRAPH_NODES:
                break

        return list(nodes.values())[:_MAX_GRAPH_NODES], list(edges.values())
