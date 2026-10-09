"""Tests for AuthService, used as a TESTS-relationship fixture."""

import hashlib

from src.models.user import User
from src.repositories.user_repository import UserRepository
from src.services.auth_service import AuthenticationError, AuthService


def _make_repository_with_user(username, password):
    repository = UserRepository()
    repository.add(User(user_id=1, username=username, password_hash=hashlib.sha256(password.encode()).hexdigest()))
    return repository


def test_authenticate_returns_token_for_valid_credentials():
    repository = _make_repository_with_user("alice", "correct-horse")
    service = AuthService(repository=repository)

    token = service.authenticate("alice", "correct-horse")

    assert token.count(".") == 2


def test_authenticate_rejects_unknown_user():
    service = AuthService(repository=UserRepository())

    try:
        service.authenticate("nobody", "whatever")
        raise AssertionError("expected AuthenticationError")
    except AuthenticationError:
        pass


def test_authorize_round_trips_issued_token():
    repository = _make_repository_with_user("bob", "hunter2")
    service = AuthService(repository=repository)
    token = service.authenticate("bob", "hunter2")

    user_id = service.authorize(token)

    assert user_id == 1
