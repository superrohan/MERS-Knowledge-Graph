"""JWT issuance and validation.

Kept deliberately small: this is a fixture repository used to exercise
the code-intelligence pipeline end to end, not a production auth module.
"""

import base64
import hashlib
import hmac
import json
import time

_SECRET_KEY = b"fixture-repository-secret-key"
_DEFAULT_TTL_SECONDS = 3600


class InvalidTokenError(Exception):
    """Raised when a JWT fails signature or expiry validation."""


class JWTValidator:
    """Issues and validates signed JSON web tokens."""

    def issue(self, user_id, ttl_seconds=_DEFAULT_TTL_SECONDS):
        payload = {"sub": user_id, "exp": int(time.time()) + ttl_seconds}
        return self._encode(payload)

    def validate(self, token):
        """Validates a token's signature and expiry, returning its payload."""
        try:
            header_b64, payload_b64, signature_b64 = token.split(".")
        except ValueError as exc:
            raise InvalidTokenError("Malformed token") from exc

        expected_signature = self._sign(f"{header_b64}.{payload_b64}")
        if not hmac.compare_digest(expected_signature, signature_b64):
            raise InvalidTokenError("Signature mismatch")

        payload = json.loads(base64.urlsafe_b64decode(payload_b64 + "=="))
        if payload["exp"] < time.time():
            raise InvalidTokenError("Token expired")

        return payload

    def _encode(self, payload):
        header_b64 = self._b64(json.dumps({"alg": "HS256"}))
        payload_b64 = self._b64(json.dumps(payload))
        signature_b64 = self._sign(f"{header_b64}.{payload_b64}")
        return f"{header_b64}.{payload_b64}.{signature_b64}"

    def _sign(self, message):
        digest = hmac.new(_SECRET_KEY, message.encode(), hashlib.sha256).digest()
        return base64.urlsafe_b64encode(digest).decode().rstrip("=")

    def _b64(self, value):
        return base64.urlsafe_b64encode(value.encode()).decode().rstrip("=")
