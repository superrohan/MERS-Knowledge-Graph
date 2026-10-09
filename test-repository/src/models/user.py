"""User domain model."""


class User:
    """A registered user of the payment platform."""

    def __init__(self, user_id, username, password_hash, is_active=True):
        self.user_id = user_id
        self.username = username
        self.password_hash = password_hash
        self.is_active = is_active

    def __repr__(self):
        return f"User(user_id={self.user_id!r}, username={self.username!r})"
