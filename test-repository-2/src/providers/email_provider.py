"""Email delivery provider.

A simulated email gateway - the fixture repository is analyzed as data
and never executed as part of indexing, so this never actually sends
anything over the network.
"""


class EmailDeliveryError(Exception):
    """Raised when an email cannot be delivered."""


class EmailProvider:
    """Sends transactional emails."""

    def __init__(self):
        self.sent = []

    def send(self, to_address, subject, body):
        if "@" not in to_address:
            raise EmailDeliveryError(f"Invalid email address: {to_address}")

        message = {"to": to_address, "subject": subject, "body": body}
        self.sent.append(message)
        return message
