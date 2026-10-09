from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from app.security import require_internal_secret

router = APIRouter()


@router.get("/health")
def public_health() -> dict:
    """Unauthenticated liveness probe (infra/orchestrator use only)."""
    return {
        "status": "ok",
        "service": "code-intelligence",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@router.get("/internal/health", dependencies=[Depends(require_internal_secret)])
def internal_health() -> dict:
    """Authenticated health check used by the Node.js backend."""
    return {
        "status": "ok",
        "service": "code-intelligence",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
