"""User-declared API/auth documentation.

The parser-based detectors (app.parsing.api_detection) only ever surface
an endpoint they can actually see in source (a decorator, a route
registration call, an annotation) - many real systems also have APIs
that are undocumented in that sense, gated behind infra the parser can't
see (an API gateway, a proxy config), or simply not worth annotating in
code. This lets a user tell the system about one directly.

Stored as real data in Postgres (never fabricated), then materialized
into the graph as an ordinary SymbolKind.API node so it shows up
everywhere a parser-detected endpoint would - graph view, query
citations, LLM answers. Lives under a synthetic file_path
("__manual__/{id}") that no real scan ever touches, so
IndexingService/GraphStore.remove_file (keyed by file_path) can never
delete it as collateral damage when the actual repository is re-indexed.

Every declaration is also checked against what the parser actually found
(app.services.api_annotation_verification) at create/update time, and can
be re-checked on demand (e.g. after a re-index surfaces a matching
endpoint) - see verification_status/verification_notes below and the
retrieval-time handling in app.retrieval/app.llm, which only ever treats
a declaration as fact once it's "confirmed".
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from uuid import uuid4

from app.db.connection import get_connection
from app.domain.api_models import ApiEndpointInfo
from app.domain.models import Symbol, SymbolKind
from app.graph.postgres_store import PostgresGraphStore
from app.services.api_annotation_verification import ApiAnnotationVerifier

MANUAL_FILE_PREFIX = "__manual__/"

_COLUMNS = (
    "id, repository_id, name, http_method, route_path, auth_required, auth_mechanism, "
    "required_roles, notes, reference_path, verification_status, verification_notes, "
    "created_at, updated_at"
)


@dataclass
class ManualApiAnnotation:
    id: str
    repository_id: str
    name: str
    created_at: str
    updated_at: str
    http_method: str | None = None
    route_path: str | None = None
    auth_required: bool = False
    auth_mechanism: str | None = None
    required_roles: list[str] = field(default_factory=list)
    notes: str | None = None
    reference_path: str | None = None
    verification_status: str = "unverified"
    verification_notes: str | None = None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "repositoryId": self.repository_id,
            "name": self.name,
            "httpMethod": self.http_method,
            "routePath": self.route_path,
            "authRequired": self.auth_required,
            "authMechanism": self.auth_mechanism,
            "requiredRoles": self.required_roles,
            "notes": self.notes,
            "referencePath": self.reference_path,
            "verificationStatus": self.verification_status,
            "verificationNotes": self.verification_notes,
            "createdAt": self.created_at,
            "updatedAt": self.updated_at,
        }

    def file_path(self) -> str:
        return f"{MANUAL_FILE_PREFIX}{self.id}"

    def to_symbol(self) -> Symbol:
        docstring_parts = [self.notes] if self.notes else []
        if self.reference_path:
            docstring_parts.append(f"Documented as implemented in {self.reference_path}.")
        file_path = self.file_path()
        return Symbol(
            id=f"{self.repository_id}::{file_path}::{self.name}",
            repository_id=self.repository_id,
            kind=SymbolKind.API,
            name=self.name,
            qualified_name=self.name,
            file_path=file_path,
            start_line=1,
            end_line=1,
            docstring=" ".join(docstring_parts) or None,
            api=ApiEndpointInfo(
                http_method=self.http_method,
                route_path=self.route_path,
                auth_required=self.auth_required,
                auth_mechanism=self.auth_mechanism,
                required_roles=self.required_roles,
                request_params=[],
                framework="manual",
                verification_status=self.verification_status,
                verification_notes=self.verification_notes,
            ),
        )


def _row_to_annotation(row) -> ManualApiAnnotation:
    (
        id_,
        repository_id,
        name,
        http_method,
        route_path,
        auth_required,
        auth_mechanism,
        required_roles,
        notes,
        reference_path,
        verification_status,
        verification_notes,
        created_at,
        updated_at,
    ) = row
    return ManualApiAnnotation(
        id=id_,
        repository_id=repository_id,
        name=name,
        http_method=http_method,
        route_path=route_path,
        auth_required=bool(auth_required),
        auth_mechanism=auth_mechanism,
        required_roles=required_roles or [],
        notes=notes,
        reference_path=reference_path,
        verification_status=verification_status or "unverified",
        verification_notes=verification_notes,
        created_at=created_at.isoformat(),
        updated_at=updated_at.isoformat(),
    )


class ManualApiAnnotationService:
    def __init__(self, graph_store: PostgresGraphStore, verifier: ApiAnnotationVerifier | None = None):
        self.graph_store = graph_store
        self.verifier = verifier or ApiAnnotationVerifier(graph_store)

    def list(self, repository_id: str) -> list[ManualApiAnnotation]:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLUMNS} FROM manual_api_annotations WHERE repository_id = %s ORDER BY created_at",
                (repository_id,),
            )
            return [_row_to_annotation(row) for row in cur.fetchall()]

    def get(self, repository_id: str, annotation_id: str) -> ManualApiAnnotation | None:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT {_COLUMNS} FROM manual_api_annotations WHERE id = %s AND repository_id = %s",
                (annotation_id, repository_id),
            )
            row = cur.fetchone()
            return _row_to_annotation(row) if row else None

    def create(
        self,
        repository_id: str,
        *,
        name: str,
        http_method: str | None = None,
        route_path: str | None = None,
        auth_required: bool = False,
        auth_mechanism: str | None = None,
        required_roles: list[str] | None = None,
        notes: str | None = None,
        reference_path: str | None = None,
    ) -> ManualApiAnnotation:
        annotation_id = f"manual_{uuid4().hex[:12]}"
        draft = ManualApiAnnotation(
            id=annotation_id,
            repository_id=repository_id,
            name=name,
            created_at="",
            updated_at="",
            http_method=http_method,
            route_path=route_path,
            auth_required=auth_required,
            auth_mechanism=auth_mechanism,
            required_roles=required_roles or [],
            notes=notes,
            reference_path=reference_path,
        )
        verification = self.verifier.verify(repository_id, draft)

        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO manual_api_annotations
                    (id, repository_id, name, http_method, route_path, auth_required, auth_mechanism,
                     required_roles, notes, reference_path, verification_status, verification_notes,
                     verified_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                RETURNING created_at, updated_at
                """,
                (
                    annotation_id,
                    repository_id,
                    name,
                    http_method,
                    route_path,
                    auth_required,
                    auth_mechanism,
                    json.dumps(required_roles or []),
                    notes,
                    reference_path,
                    verification.status,
                    verification.notes,
                ),
            )
            created_at, updated_at = cur.fetchone()
            conn.commit()

        draft.created_at = created_at.isoformat()
        draft.updated_at = updated_at.isoformat()
        draft.verification_status = verification.status
        draft.verification_notes = verification.notes
        self._materialize(draft)
        return draft

    def update(self, repository_id: str, annotation_id: str, **fields) -> ManualApiAnnotation | None:
        existing = self.get(repository_id, annotation_id)
        if existing is None:
            return None

        merged = {
            "name": fields.get("name", existing.name),
            "http_method": fields.get("http_method", existing.http_method),
            "route_path": fields.get("route_path", existing.route_path),
            "auth_required": fields.get("auth_required", existing.auth_required),
            "auth_mechanism": fields.get("auth_mechanism", existing.auth_mechanism),
            "required_roles": fields.get("required_roles", existing.required_roles),
            "notes": fields.get("notes", existing.notes),
            "reference_path": fields.get("reference_path", existing.reference_path),
        }
        draft = ManualApiAnnotation(
            id=annotation_id, repository_id=repository_id, created_at=existing.created_at, updated_at="", **merged
        )
        verification = self.verifier.verify(repository_id, draft)

        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                UPDATE manual_api_annotations SET
                    name = %s, http_method = %s, route_path = %s, auth_required = %s, auth_mechanism = %s,
                    required_roles = %s, notes = %s, reference_path = %s, verification_status = %s,
                    verification_notes = %s, verified_at = now(), updated_at = now()
                WHERE id = %s AND repository_id = %s
                RETURNING updated_at
                """,
                (
                    merged["name"],
                    merged["http_method"],
                    merged["route_path"],
                    merged["auth_required"],
                    merged["auth_mechanism"],
                    json.dumps(merged["required_roles"]),
                    merged["notes"],
                    merged["reference_path"],
                    verification.status,
                    verification.notes,
                    annotation_id,
                    repository_id,
                ),
            )
            (updated_at,) = cur.fetchone()
            conn.commit()

        draft.updated_at = updated_at.isoformat()
        draft.verification_status = verification.status
        draft.verification_notes = verification.notes
        self._materialize(draft)
        return draft

    def reverify(self, repository_id: str, annotation_id: str) -> ManualApiAnnotation | None:
        """Re-runs verification without changing any declared field -
        useful after a re-index surfaces a parser-detected endpoint that
        didn't exist (or wasn't found) when this was first declared."""
        existing = self.get(repository_id, annotation_id)
        if existing is None:
            return None
        return self.update(
            repository_id,
            annotation_id,
            name=existing.name,
            http_method=existing.http_method,
            route_path=existing.route_path,
            auth_required=existing.auth_required,
            auth_mechanism=existing.auth_mechanism,
            required_roles=existing.required_roles,
            notes=existing.notes,
            reference_path=existing.reference_path,
        )

    def delete(self, repository_id: str, annotation_id: str) -> bool:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                "DELETE FROM manual_api_annotations WHERE id = %s AND repository_id = %s",
                (annotation_id, repository_id),
            )
            deleted = cur.rowcount > 0
            conn.commit()
        if deleted:
            self.graph_store.remove_file(repository_id, f"{MANUAL_FILE_PREFIX}{annotation_id}")
        return deleted

    def _materialize(self, annotation: ManualApiAnnotation) -> None:
        # remove-then-add keeps this idempotent on update, without needing
        # a separate "replace node properties" primitive on the store.
        self.graph_store.remove_file(annotation.repository_id, annotation.file_path())
        self.graph_store.add_symbols(annotation.repository_id, [annotation.to_symbol()])
