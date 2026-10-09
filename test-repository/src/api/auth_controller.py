"""HTTP entry point for authentication.

This module has no framework dependency (no Flask/FastAPI) on purpose -
the fixture repository is analyzed as data, never executed, so it only
needs to be structurally realistic Python, not a runnable web server.
"""

from src.services.auth_service import AuthenticationError, AuthService


class LoginController:
    """Handles incoming login requests."""

    def __init__(self, auth_service=None):
        self.auth_service = auth_service or AuthService()

    def login(self, request):
        """Authenticates the request's credentials and returns a token."""
        username = request.get("username")
        password = request.get("password")

        if not username or not password:
            return {"status": 400, "error": "username and password are required"}

        try:
            token = self.auth_service.authenticate(username, password)
        except AuthenticationError as exc:
            return {"status": 401, "error": str(exc)}

        return {"status": 200, "token": token}

    def logout(self, request):
        """Placeholder logout endpoint; token invalidation happens client-side."""
        return {"status": 200}
