"""Orchestrates one indexing run for *one physical repository* within an
application: scan -> parse (incrementally, per language) -> build graph
-> chunk -> embed -> finalize.

An application can have several repositories (see repo_key below); they
all land in the *same* AGE graph (repository_id = the application id),
so cross-repo relationships (a frontend fetch() call resolving to a
backend API route) can exist as real edges. Every file's path is
prefixed with its repo_key so two repos' identically-named files never
collide in that shared graph.

Real incrementality goes further than a plain per-file hash check: a
file whose content hash is unchanged since the last run is never
re-parsed, *and* - because embeddings are computed per-chunk rather
than fit over a whole-repository corpus (see app.embeddings.factory) -
its chunks are never re-embedded either. Re-resolving relationships,
however, always considers the *full* cross-repo manifest, not just the
repo currently being (re)indexed - otherwise re-indexing just the
backend would wipe out the frontend's already-resolved edges.
"""

from __future__ import annotations

import hashlib
import logging

from app.domain.models import RelationshipType
from app.embeddings.factory import get_embedding_provider
from app.graph.graph_builder import GraphBuilder
from app.ingestion.chunker import chunk_symbol
from app.ingestion.scanner import RepositoryScanner
from app.parsing.registry import get_parser_class
from app.services import spring_security_merger
from app.services.postgres_manifest import FileManifestEntry, PostgresManifestStore
from app.services.postgres_repository_registry import DEFAULT_REPO_KEY

logger = logging.getLogger(__name__)

_RESOLVED_RELATIONSHIP_TYPES = {
    RelationshipType.CALLS,
    RelationshipType.IMPORTS,
    RelationshipType.EXTENDS,
    RelationshipType.USES,
    RelationshipType.TESTS,
    RelationshipType.HANDLES,
    RelationshipType.CALLS_API,
}

_EMBEDDING_BATCH_SIZE = 100


class IndexingCancelled(Exception):
    pass


class IndexingService:
    def __init__(self, graph_store, vector_store, manifest_store: PostgresManifestStore, job_manager, repository_registry):
        self.graph_store = graph_store
        self.vector_store = vector_store
        self.manifest_store = manifest_store
        self.job_manager = job_manager
        self.repository_registry = repository_registry

    def run(self, job_id: str, repository_id: str, repository_path: str, repo_key: str = DEFAULT_REPO_KEY) -> None:
        try:
            self._run(job_id, repository_id, repository_path, repo_key)
        except IndexingCancelled:
            self.job_manager.mark_cancelled(job_id)
        except Exception as exc:  # noqa: BLE001 - top-level job boundary
            logger.exception("Indexing job %s failed", job_id)
            self.job_manager.mark_failed(job_id, str(exc))

    def _check_cancelled(self, job_id: str) -> None:
        job = self.job_manager.get(job_id)
        if job is not None and job.cancel_requested:
            raise IndexingCancelled()

    def _run(self, job_id: str, repository_id: str, repository_path: str, repo_key: str) -> None:
        graph_store = self.graph_store
        # A single-repo application never sets repo_key, so it stays
        # exactly as before (no prefix, no namespacing overhead). Only a
        # genuinely multi-repo application (repo_key explicitly given,
        # e.g. "frontend"/"backend") gets its files prefixed to keep them
        # distinct within the one shared graph.
        prefix = "" if repo_key == DEFAULT_REPO_KEY else f"{repo_key}/"
        # Every other table is keyed by (repository_id, ...) with no FK
        # enforcement, but this row is still what the source-viewer and
        # cross-repo stats aggregation rely on - write it first.
        self.repository_registry.set_path(repository_id, repo_key, repository_path)

        self.job_manager.update_progress(job_id, "SCANNING", 3)
        scan = RepositoryScanner().scan(repository_path)
        this_repo_languages = {lang: len(files) for lang, files in scan.files_by_language().items()}
        self.job_manager.update_progress(
            job_id, "SCANNING", 8,
            message=f"[{repo_key}] {len(scan.all_files)} files discovered",
        )

        # Full manifest across every repo in this application - resolution
        # below must consider all of it, not just this repo_key's slice.
        full_manifest = self.manifest_store.get_all(repository_id)
        this_repo_previous_paths = {p for p in full_manifest if p.startswith(prefix)}
        current_paths = {prefix + f.relative_path for f in scan.parseable_files}
        deleted_paths = this_repo_previous_paths - current_paths
        for path in deleted_paths:
            graph_store.remove_file(repository_id, path)
            self.vector_store.remove_file(repository_id, path)
            self.manifest_store.remove_entry(repository_id, path)
            full_manifest.pop(path, None)

        parsers = {}  # language -> parser instance, built lazily/once
        changed_paths: set[str] = set()
        changed_sources: dict[str, str] = {}
        total = max(len(scan.parseable_files), 1)

        self.job_manager.update_progress(job_id, "PARSING", 10)
        for i, scanned_file in enumerate(scan.parseable_files):
            self._check_cancelled(job_id)
            prefixed_path = prefix + scanned_file.relative_path
            with open(scanned_file.absolute_path, "rb") as fh:
                raw = fh.read()
            content_hash = hashlib.sha256(raw).hexdigest()
            cached = full_manifest.get(prefixed_path)

            if cached is None or cached.content_hash != content_hash:
                changed_paths.add(prefixed_path)
                source = raw.decode("utf-8", errors="replace")
                changed_sources[prefixed_path] = source

                graph_store.remove_file(repository_id, prefixed_path)
                self.vector_store.remove_file(repository_id, prefixed_path)

                if scanned_file.language not in parsers:
                    parsers[scanned_file.language] = get_parser_class(scanned_file.language)(repository_id)
                parser = parsers[scanned_file.language]

                parsed, unresolved = parser.parse(prefixed_path, source)
                graph_store.add_symbols(repository_id, parsed.symbols)
                graph_store.add_relationships(repository_id, parsed.relationships)  # DEFINES/HANDLES only
                entry = FileManifestEntry(content_hash, unresolved, security_rules=parsed.security_rules)
                self.manifest_store.set_entry(repository_id, prefixed_path, entry)
                full_manifest[prefixed_path] = entry

            progress = 10 + int(35 * (i + 1) / total)
            self.job_manager.update_progress(
                job_id, "PARSING", progress,
                message=f"[{repo_key}] Parsed {i + 1}/{total} files",
            )

        self._check_cancelled(job_id)
        self.job_manager.update_progress(job_id, "BUILDING_GRAPH", 50)
        # Resolve against every repo's unresolved references, not just
        # this run's - otherwise re-indexing one repo would drop the
        # other repo(s)' already-resolved (and cross-repo) edges.
        all_unresolved = [ref for entry in full_manifest.values() for ref in entry.unresolved]
        graph_store.clear_relationships_by_types(repository_id, _RESOLVED_RELATIONSHIP_TYPES)
        relationships = GraphBuilder(graph_store).resolve(repository_id, all_unresolved)
        graph_store.add_relationships(repository_id, relationships)

        # Fold every repo's Spring Security global filter-chain rules
        # (usually declared in one config file, governing routes in many
        # others) into the routes they actually match - considers the
        # full cross-repo manifest for the same reason relationship
        # resolution above does.
        all_security_rules = [rule for entry in full_manifest.values() for rule in entry.security_rules]
        if all_security_rules:
            security_updates = spring_security_merger.compute_updates(
                graph_store.all_symbols(repository_id), all_security_rules
            )
            graph_store.merge_security_rule(repository_id, security_updates)

        graph_stats = graph_store.stats(repository_id)
        self.job_manager.update_progress(
            job_id, "BUILDING_GRAPH", 58,
            message=f"{graph_stats['symbols']} symbols, {graph_stats['relationships']} relationships",
            stats={"symbols": graph_stats["symbols"], "relationships": graph_stats["relationships"]},
        )

        self._check_cancelled(job_id)
        self.job_manager.update_progress(job_id, "CREATING_CHUNKS", 62)
        symbols_by_file: dict[str, list] = {}
        for symbol in graph_store.all_symbols(repository_id):
            symbols_by_file.setdefault(symbol.file_path, []).append(symbol)

        new_chunks = []
        for path in changed_paths:
            source_lines = changed_sources[path].splitlines()
            for symbol in symbols_by_file.get(path, []):
                new_chunks.extend(chunk_symbol(repository_id, symbol, source_lines))

        self.job_manager.update_progress(
            job_id, "CREATING_CHUNKS", 68,
            message=f"[{repo_key}] {len(new_chunks)} new/changed code chunks",
        )

        self._check_cancelled(job_id)
        self.job_manager.update_progress(job_id, "GENERATING_EMBEDDINGS", 72)
        provider = get_embedding_provider()
        embedded_count = 0
        for offset in range(0, len(new_chunks), _EMBEDDING_BATCH_SIZE):
            self._check_cancelled(job_id)
            batch = new_chunks[offset : offset + _EMBEDDING_BATCH_SIZE]
            vectors = provider.embed_documents([c.text for c in batch])
            for chunk, vector in zip(batch, vectors):
                self.vector_store.add(repository_id, chunk, vector)
            embedded_count += len(batch)
            self.job_manager.update_progress(
                job_id, "GENERATING_EMBEDDINGS", 72 + int(16 * embedded_count / max(len(new_chunks), 1)),
                message=f"[{repo_key}] {embedded_count}/{len(new_chunks)} chunks embedded",
            )

        self.job_manager.update_progress(job_id, "BUILDING_VECTOR_INDEX", 92)

        self.job_manager.update_progress(job_id, "FINALIZING", 97)
        # Cumulative across every repo in the application, not just this
        # run's - each repo's own last scan is remembered independently.
        self.repository_registry.set_path(
            repository_id, repo_key, repository_path,
            scan_stats={"files": len(scan.all_files), "parsedFiles": len(scan.parseable_files), "languages": this_repo_languages},
        )
        all_repo_stats = self.repository_registry.get_all_scan_stats(repository_id).values()
        cumulative_languages: dict[str, int] = {}
        for repo_stats in all_repo_stats:
            for lang, count in (repo_stats.get("languages") or {}).items():
                cumulative_languages[lang] = cumulative_languages.get(lang, 0) + count

        final_stats = {
            "files": sum(s.get("files", 0) for s in all_repo_stats),
            "parsedFiles": sum(s.get("parsedFiles", 0) for s in all_repo_stats),
            "languages": cumulative_languages,
            "classes": graph_stats["classes"],
            "functions": graph_stats["functions"] + graph_stats["methods"],
            "symbols": graph_stats["symbols"],
            "relationships": graph_store.stats(repository_id)["relationships"],
            "chunks": self.vector_store.count(repository_id),
            "embeddings": self.vector_store.count(repository_id),
        }
        self.job_manager.mark_completed(job_id, stats=final_stats)
