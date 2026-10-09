"""HTTP entry point for payments."""

from src.services.payment_service import PaymentError, PaymentService


class PaymentController:
    """Handles POST /payments and related payment requests."""

    def __init__(self, payment_service=None):
        self.payment_service = payment_service or PaymentService()

    def create(self, request):
        """POST /payments - creates a new payment for the authenticated user."""
        try:
            payment = self.payment_service.create_payment(
                user_id=request.get("userId"),
                amount=request.get("amount"),
                currency=request.get("currency", "USD"),
            )
        except PaymentError as exc:
            return {"status": 400, "error": str(exc)}

        return {"status": 201, "paymentId": payment.payment_id, "status_value": payment.status}

    def capture(self, request):
        """POST /payments/:id/capture - processes a previously created payment."""
        payment = self.payment_service.process_payment(request.get("paymentId"))
        return {"status": 200, "paymentStatus": payment.status}
