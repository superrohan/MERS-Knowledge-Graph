"""Payment domain model."""


class Payment:
    """A single payment transaction."""

    def __init__(self, payment_id, amount, currency, user_id, status="PENDING"):
        self.payment_id = payment_id
        self.amount = amount
        self.currency = currency
        self.user_id = user_id
        self.status = status

    def mark_completed(self):
        self.status = "COMPLETED"

    def mark_failed(self):
        self.status = "FAILED"
