"""Tests for NotificationService, used as a TESTS-relationship fixture."""

from src.models.customer import Customer
from src.models.order import Order, OrderItem
from src.providers.email_provider import EmailProvider
from src.providers.sms_provider import SmsProvider
from src.repositories.customer_repository import CustomerRepository
from src.services.notification_service import NotificationService


def _make_service_and_customer(phone_number=None):
    customers = CustomerRepository()
    customer = Customer(customer_id=1, email="customer@example.com", phone_number=phone_number)
    customers.add(customer)
    email_provider = EmailProvider()
    sms_provider = SmsProvider()
    service = NotificationService(
        customer_repository=customers, email_provider=email_provider, sms_provider=sms_provider
    )
    return service, email_provider, sms_provider


def test_notify_order_confirmed_sends_email():
    service, email_provider, _ = _make_service_and_customer()
    order = Order(order_id="ord-1", customer_id=1, items=[OrderItem("sku-1", 1, 10.0)])

    service.notify_order_confirmed(order)

    assert len(email_provider.sent) == 1
    assert email_provider.sent[0]["to"] == "customer@example.com"


def test_notify_order_confirmed_also_sends_sms_when_phone_number_present():
    service, _, sms_provider = _make_service_and_customer(phone_number="+15551234567")
    order = Order(order_id="ord-2", customer_id=1, items=[OrderItem("sku-1", 1, 10.0)])

    service.notify_order_confirmed(order)

    assert len(sms_provider.sent) == 1


def test_notify_order_cancelled_sends_email():
    service, email_provider, _ = _make_service_and_customer()
    order = Order(order_id="ord-3", customer_id=1, items=[OrderItem("sku-1", 1, 10.0)])

    service.notify_order_cancelled(order)

    assert "cancelled" in email_provider.sent[0]["subject"]
