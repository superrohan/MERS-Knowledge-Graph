"""Order creation and lifecycle management."""

from src.models.order import Order, OrderItem
from src.repositories.order_repository import OrderRepository
from src.services.notification_service import NotificationService


class OrderError(Exception):
    """Raised when an order cannot be created or transitioned."""


class OrderService:
    """Creates orders and coordinates confirmation/cancellation notifications."""

    def __init__(self, repository=None, notification_service=None):
        self.repository = repository or OrderRepository()
        self.notification_service = notification_service or NotificationService()

    def create_order(self, order_id, customer_id, line_items):
        """Creates a new order from a list of (sku, quantity, unit_price) tuples."""
        if not line_items:
            raise OrderError("An order must contain at least one item")

        items = [OrderItem(sku, quantity, unit_price) for sku, quantity, unit_price in line_items]
        order = Order(order_id=order_id, customer_id=customer_id, items=items)
        self.repository.add(order)
        return order

    def confirm_order(self, order_id):
        """Confirms an order and notifies the customer."""
        order = self._get_order(order_id)
        order.mark_confirmed()
        self.notification_service.notify_order_confirmed(order)
        return order

    def cancel_order(self, order_id):
        """Cancels an order and notifies the customer."""
        order = self._get_order(order_id)
        order.mark_cancelled()
        self.notification_service.notify_order_cancelled(order)
        return order

    def _get_order(self, order_id):
        order = self.repository.find(order_id)
        if not order:
            raise OrderError(f"Unknown order {order_id}")
        return order
