"""HTTP entry point for orders."""

from src.services.order_service import OrderError, OrderService


class OrderController:
    """Handles POST /orders and related order requests."""

    def __init__(self, order_service=None):
        self.order_service = order_service or OrderService()

    def create(self, request):
        """POST /orders - creates a new order for the requesting customer."""
        try:
            order = self.order_service.create_order(
                order_id=request.get("orderId"),
                customer_id=request.get("customerId"),
                line_items=request.get("items", []),
            )
        except OrderError as exc:
            return {"status": 400, "error": str(exc)}

        return {"status": 201, "orderId": order.order_id, "total": order.total()}

    def confirm(self, request):
        """POST /orders/:id/confirm - confirms an order and triggers customer notifications."""
        try:
            order = self.order_service.confirm_order(request.get("orderId"))
        except OrderError as exc:
            return {"status": 404, "error": str(exc)}
        return {"status": 200, "status_value": order.status}

    def cancel(self, request):
        """POST /orders/:id/cancel - cancels an order and notifies the customer."""
        try:
            order = self.order_service.cancel_order(request.get("orderId"))
        except OrderError as exc:
            return {"status": 404, "error": str(exc)}
        return {"status": 200, "status_value": order.status}
