import threading

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.container import indexing_service, job_manager
from app.security import require_internal_secret
from app.services.postgres_repository_registry import DEFAULT_REPO_KEY

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal_secret)])


class IndexRequest(BaseModel):
    repository_id: str
    repository_path: str
    commit_hash: str | None = None
    # Which physical repository this is within the application - lets an
    # application span several repos (e.g. "frontend"/"backend") sharing
    # one knowledge graph. Defaults to a single canonical key so a plain
    # single-repo application needs no changes.
    repo_key: str = DEFAULT_REPO_KEY


@router.post("/index")
def start_index(request: IndexRequest) -> dict:
    # IndexingService writes the `repositories` row itself, first thing.
    job = job_manager.create(request.repository_id, request.repository_path, request.commit_hash)

    thread = threading.Thread(
        target=indexing_service.run,
        args=(job.id, request.repository_id, request.repository_path, request.repo_key),
        daemon=True,
    )
    thread.start()

    return {"jobId": job.id, "status": job.status}


@router.get("/index/{job_id}")
def get_index_status(job_id: str) -> dict:
    job = job_manager.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail=f"No job found with id {job_id}.")
    return job.to_dict()


@router.post("/index/{job_id}/cancel")
def cancel_index(job_id: str) -> dict:
    if not job_manager.request_cancel(job_id):
        raise HTTPException(status_code=404, detail=f"No cancellable job found with id {job_id}.")
    return {"cancelled": True}
