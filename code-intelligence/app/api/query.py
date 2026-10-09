from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.container import query_engine
from app.llm.answer_generator import LLMUnavailableError
from app.security import require_internal_secret

router = APIRouter(prefix="/internal", dependencies=[Depends(require_internal_secret)])


class QueryRequest(BaseModel):
    repository_id: str
    query: str


@router.post("/query")
def run_query(request: QueryRequest) -> dict:
    if not request.query or not request.query.strip():
        raise HTTPException(status_code=400, detail="query is required.")
    try:
        return query_engine.query(request.repository_id, request.query.strip())
    except LLMUnavailableError as exc:
        raise HTTPException(status_code=502, detail=f"LLM unavailable: {exc}") from exc
