"""Internal-service authentication.

The Python service must never be reachable directly from the browser. As a
defense-in-depth measure (on top of network placement), every route under
``/internal`` requires a shared secret header that only the Node.js backend
knows.
"""

from fastapi import Header, HTTPException, status

from app.config import settings


def require_internal_secret(x_internal_secret: str | None = Header(default=None)) -> None:
    if x_internal_secret != settings.internal_service_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid internal service credentials.",
        )
