"""Payment processing."""

import itertools

from src.models.payment import Payment
from src.repositories.user_repository import UserRepository

_payment_id_seq = itertools.count(1)


class PaymentError(Exception):
    """Raised when a payment cannot be created or processed."""


class PaymentService:
    """Creates and processes payments on behalf of a user."""

    def __init__(self, repository=None):
        self.repository = repository or UserRepository()
        self._payments = {}

    def create_payment(self, user_id, amount, currency="USD"):
        """Creates a new payment for an existing, active user."""
        user = self.repository.find_by_id(user_id)
        if not user or not user.is_active:
            raise PaymentError("User is not eligible to make payments")

        payment = Payment(payment_id=next(_payment_id_seq), amount=amount, currency=currency, user_id=user_id)
        self._payments[payment.payment_id] = payment
        return payment

    def process_payment(self, payment_id):
        """Marks a payment completed, simulating a downstream gateway call."""
        payment = self._payments.get(payment_id)
        if not payment:
            raise PaymentError(f"Unknown payment {payment_id}")

        if self._call_gateway(payment):
            payment.mark_completed()
        else:
            payment.mark_failed()
        return payment

    def _call_gateway(self, payment):
        # Simulated payment gateway; always succeeds in the fixture repo.
        return payment.amount > 0
