"""Persistence for Order records (in-memory, self-contained fixture)."""

from src.models.order import Order


class OrderRepository:
    """Stores and looks up Order records."""

    def __init__(self):
        self._orders_by_id = {}

    def add(self, order):
        self._orders_by_id[order.order_id] = order
        return order

    def find(self, order_id):
        return self._orders_by_id.get(order_id)

    def find_by_customer(self, customer_id):
        return [o for o in self._orders_by_id.values() if o.customer_id == customer_id]

    def all(self):
        return list(self._orders_by_id.values())
