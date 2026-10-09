import os
from collections import Counter

from fastapi import APIRouter, Depends, HTTPException

from app.container import graph_store, repository_registry, vector_store
from app.domain.models import SymbolKind
from app.retrieval.graph_retriever import GraphRetriever
from app.security import require_internal_secret
from app.services.postgres_repository_registry import DEFAULT_REPO_KEY

router = APIRouter(prefix="/internal/repositories", dependencies=[Depends(require_internal_secret)])

_DEFAULT_GRAPH_LIMIT = 40
_MAX_GRAPH_LIMIT = 150


@router.get("/{repository_id}/stats")
def get_stats(repository_id: str) -> dict:
    stats = graph_store.stats(repository_id)
    return {
        "files": stats["files"],
        "classes": stats["classes"],
        "functions": stats["functions"] + stats["methods"],
        "symbols": stats["symbols"],
        "relationships": stats["relationships"],
        "chunks": vector_store.count(repository_id),
    }


@router.get("/{repository_id}/graph")
def get_graph(
    repository_id: str,
    search: str | None = None,
    node_types: str | None = None,
    relationship_types: str | None = None,
    limit: int = _DEFAULT_GRAPH_LIMIT,
) -> dict:
    limit = max(1, min(limit, _MAX_GRAPH_LIMIT))
    node_type_filter = set(node_types.split(",")) if node_types else None
    rel_type_filter = set(relationship_types.split(",")) if relationship_types else None

    if search:
        seeds = graph_store.find_symbols(repository_id, name_contains=search, limit=10)
        seed_ids = {s.id for s in seeds}
        nodes, edges = GraphRetriever(graph_store).expand(repository_id, seed_ids, direction="both", hops=2)
        if not nodes:
            nodes, edges = seeds, []
    else:
        # No focus given: start with the most-connected symbols so a large
        # repository still renders a legible, bounded subgraph (spec §22).
        # API endpoints are the exception - they're structurally important
        # (they're the app's actual surface) but often have *low* degree
        # (nothing else in the codebase calls an HTTP entry point, so a
        # pure by-degree ranking buries them in any real-sized repo).
        # Reserve a third of the budget for them, unconditionally.
        all_symbols = graph_store.all_symbols(repository_id)
        degree: Counter = Counter()
        for rel in graph_store.get_relationships(repository_id):
            degree[rel.source_id] += 1
            degree[rel.target_id] += 1

        api_nodes = sorted(
            (s for s in all_symbols if s.kind == SymbolKind.API), key=lambda s: -degree.get(s.id, 0)
        )[: max(1, limit // 3)]
        api_ids = {s.id for s in api_nodes}
        other_nodes = sorted(
            (s for s in all_symbols if s.id not in api_ids), key=lambda s: -degree.get(s.id, 0)
        )
        nodes = api_nodes + other_nodes
        node_ids = {n.id for n in nodes[: limit * 2]}
        edges = [
            r for r in graph_store.get_relationships(repository_id)
            if r.source_id in node_ids and r.target_id in node_ids
        ]

    if node_type_filter:
        nodes = [n for n in nodes if n.kind.value in node_type_filter]
    node_ids = {n.id for n in nodes[:limit]}
    nodes = nodes[:limit]
    edges = [e for e in edges if e.source_id in node_ids and e.target_id in node_ids]
    if rel_type_filter:
        edges = [e for e in edges if e.type.value in rel_type_filter]

    return {"nodes": [n.to_dict() for n in nodes], "edges": [e.to_dict() for e in edges]}


@router.get("/{repository_id}/source")
def get_source(repository_id: str, path: str, start_line: int | None = None, end_line: int | None = None) -> dict:
    # A single-repo application's file_path is unprefixed, exactly as
    # scanned. A multi-repo application's is "{repo_key}/{path-within-
    # that-repo}" (see IndexingService) - only split it apart when this
    # application actually *has* more than one registered repo, so a
    # single-repo file whose own top-level folder happens to share a name
    # with something else is never misread as a repo_key.
    registered_keys = repository_registry.list_repo_keys(repository_id)
    if len(registered_keys) > 1 and "/" in path:
        repo_key, sub_path = path.split("/", 1)
        if repo_key not in registered_keys:
            raise HTTPException(status_code=404, detail=f"Unknown repository '{repo_key}' for this application.")
    else:
        repo_key, sub_path = DEFAULT_REPO_KEY, path

    repo_path = repository_registry.get_path(repository_id, repo_key)
    if repo_path is None:
        raise HTTPException(status_code=404, detail="Repository has not been indexed yet.")

    root = os.path.realpath(repo_path)
    target = os.path.realpath(os.path.join(root, sub_path))
    if not (target == root or target.startswith(root + os.sep)):
        raise HTTPException(status_code=400, detail="Invalid file path.")
    if not os.path.isfile(target):
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    with open(target, encoding="utf-8", errors="replace") as fh:
        lines = fh.read().splitlines()

    total = len(lines)
    start = max(1, start_line or 1)
    end = min(total, end_line or total) if total else 0

    return {
        "filePath": path,
        "startLine": start,
        "endLine": end,
        "totalLines": total,
        "lines": lines[start - 1 : end] if total else [],
    }
