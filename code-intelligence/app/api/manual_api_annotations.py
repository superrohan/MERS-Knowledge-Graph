from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.container import manual_api_annotation_service
from app.security import require_internal_secret

router = APIRouter(prefix="/internal/repositories", dependencies=[Depends(require_internal_secret)])


class AnnotationRequest(BaseModel):
    name: str
    http_method: str | None = None
    route_path: str | None = None
    auth_required: bool = False
    auth_mechanism: str | None = None
    required_roles: list[str] = Field(default_factory=list)
    notes: str | None = None
    reference_path: str | None = None


@router.get("/{repository_id}/api-annotations")
def list_annotations(repository_id: str) -> list[dict]:
    return [a.to_dict() for a in manual_api_annotation_service.list(repository_id)]


@router.post("/{repository_id}/api-annotations", status_code=201)
def create_annotation(repository_id: str, request: AnnotationRequest) -> dict:
    annotation = manual_api_annotation_service.create(repository_id, **request.model_dump())
    return annotation.to_dict()


@router.put("/{repository_id}/api-annotations/{annotation_id}")
def update_annotation(repository_id: str, annotation_id: str, request: AnnotationRequest) -> dict:
    annotation = manual_api_annotation_service.update(repository_id, annotation_id, **request.model_dump())
    if annotation is None:
        raise HTTPException(status_code=404, detail=f"No annotation found with id {annotation_id}.")
    return annotation.to_dict()


@router.delete("/{repository_id}/api-annotations/{annotation_id}")
def delete_annotation(repository_id: str, annotation_id: str) -> dict:
    deleted = manual_api_annotation_service.delete(repository_id, annotation_id)
    if not deleted:
        raise HTTPException(status_code=404, detail=f"No annotation found with id {annotation_id}.")
    return {"deleted": True}


@router.post("/{repository_id}/api-annotations/{annotation_id}/verify")
def verify_annotation(repository_id: str, annotation_id: str) -> dict:
    """Re-runs verification without changing any declared field - e.g.
    after a re-index surfaces a parser-detected endpoint that didn't
    exist (or wasn't found) when this was first declared."""
    annotation = manual_api_annotation_service.reverify(repository_id, annotation_id)
    if annotation is None:
        raise HTTPException(status_code=404, detail=f"No annotation found with id {annotation_id}.")
    return annotation.to_dict()
