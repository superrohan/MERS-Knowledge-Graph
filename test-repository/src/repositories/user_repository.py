"""Persistence for User records.

This is an in-memory stand-in for a real database-backed repository, used
so the fixture repository is self-contained and runnable without any
external services.
"""

from src.models.user import User


class UserRepository:
    """Looks up and persists User records."""

    def __init__(self):
        self._users_by_username = {}

    def add(self, user):
        self._users_by_username[user.username] = user
        return user

    def find(self, username):
        """Finds a user by username, or returns None."""
        return self._users_by_username.get(username)

    def find_by_id(self, user_id):
        for user in self._users_by_username.values():
            if user.user_id == user_id:
                return user
        return None

    def exists(self, username):
        return username in self._users_by_username
