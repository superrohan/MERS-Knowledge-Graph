"""Order domain models."""


class OrderItem:
    """A single line item within an order."""

    def __init__(self, sku, quantity, unit_price):
        self.sku = sku
        self.quantity = quantity
        self.unit_price = unit_price

    def subtotal(self):
        return self.quantity * self.unit_price


class Order:
    """A customer order composed of one or more line items."""

    def __init__(self, order_id, customer_id, items=None, status="PENDING"):
        self.order_id = order_id
        self.customer_id = customer_id
        self.items = items or []
        self.status = status

    def total(self):
        return sum(item.subtotal() for item in self.items)

    def mark_confirmed(self):
        self.status = "CONFIRMED"

    def mark_cancelled(self):
        self.status = "CANCELLED"
