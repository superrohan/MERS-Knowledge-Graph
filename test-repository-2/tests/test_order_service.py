"""Tests for OrderService, used as a TESTS-relationship fixture."""

from src.models.customer import Customer
from src.repositories.customer_repository import CustomerRepository
from src.repositories.order_repository import OrderRepository
from src.services.notification_service import NotificationService
from src.services.order_service import OrderError, OrderService


def _make_order_service_with_customer(customer_id, email="a@example.com"):
    customers = CustomerRepository()
    customers.add(Customer(customer_id=customer_id, email=email))
    notifications = NotificationService(customer_repository=customers)
    return OrderService(repository=OrderRepository(), notification_service=notifications)


def test_create_order_computes_total():
    service = _make_order_service_with_customer(1)

    order = service.create_order("ord-1", customer_id=1, line_items=[("sku-1", 2, 10.0), ("sku-2", 1, 5.0)])

    assert order.total() == 25.0


def test_create_order_requires_at_least_one_item():
    service = _make_order_service_with_customer(1)

    try:
        service.create_order("ord-2", customer_id=1, line_items=[])
        raise AssertionError("expected OrderError")
    except OrderError:
        pass


def test_confirm_order_sends_a_notification():
    service = _make_order_service_with_customer(2)
    service.create_order("ord-3", customer_id=2, line_items=[("sku-1", 1, 20.0)])

    confirmed = service.confirm_order("ord-3")

    assert confirmed.status == "CONFIRMED"


def test_cancel_unknown_order_raises():
    service = _make_order_service_with_customer(3)

    try:
        service.cancel_order("does-not-exist")
        raise AssertionError("expected OrderError")
    except OrderError:
        pass
