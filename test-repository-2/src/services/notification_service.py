"""Order-related customer notifications."""

from src.providers.email_provider import EmailProvider
from src.providers.sms_provider import SmsProvider
from src.repositories.customer_repository import CustomerRepository


class NotificationService:
    """Notifies customers about order lifecycle events by email and SMS."""

    def __init__(self, customer_repository=None, email_provider=None, sms_provider=None):
        self.customer_repository = customer_repository or CustomerRepository()
        self.email_provider = email_provider or EmailProvider()
        self.sms_provider = sms_provider or SmsProvider()

    def notify_order_confirmed(self, order):
        """Sends an order-confirmation email, and an SMS if the customer has a phone number."""
        customer = self.customer_repository.find(order.customer_id)
        if not customer:
            return

        self.email_provider.send(
            to_address=customer.email,
            subject=f"Order {order.order_id} confirmed",
            body=f"Your order total is {order.total()}.",
        )

        if customer.phone_number:
            self.sms_provider.send(customer.phone_number, f"Order {order.order_id} confirmed.")

    def notify_order_cancelled(self, order):
        """Sends an order-cancellation email."""
        customer = self.customer_repository.find(order.customer_id)
        if not customer:
            return

        self.email_provider.send(
            to_address=customer.email,
            subject=f"Order {order.order_id} cancelled",
            body="Your order has been cancelled.",
        )
