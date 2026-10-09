"""Authentication service.

Coordinates credential verification (via UserRepository) and token
issuance/validation (via JWTValidator). This is the module the fixture
repository's "How does authentication work?" query is expected to
surface.
"""

import hashlib

from src.repositories.user_repository import UserRepository
from src.security.jwt import InvalidTokenError, JWTValidator


class AuthenticationError(Exception):
    """Raised when credentials are invalid or a user cannot be authenticated."""


class AuthService:
    """Authenticates users and issues/validates session tokens."""

    def __init__(self, repository=None, jwt_validator=None):
        self.repository = repository or UserRepository()
        self.jwt_validator = jwt_validator or JWTValidator()

    def authenticate(self, username, password):
        """Verifies a username/password pair and returns a session token."""
        user = self.repository.find(username)
        if not user:
            raise AuthenticationError("Unknown user")

        if not self._verify_password(password, user.password_hash):
            raise AuthenticationError("Invalid credentials")

        if not user.is_active:
            raise AuthenticationError("Account is disabled")

        return self.jwt_validator.issue(user.user_id)

    def authorize(self, token):
        """Validates a session token and returns the authenticated user id."""
        try:
            payload = self.jwt_validator.validate(token)
        except InvalidTokenError as exc:
            raise AuthenticationError("Session expired or invalid") from exc
        return payload["sub"]

    def _verify_password(self, password, password_hash):
        return hashlib.sha256(password.encode()).hexdigest() == password_hash
