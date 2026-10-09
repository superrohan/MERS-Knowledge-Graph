"""Tests for PaymentService, used as a TESTS-relationship fixture."""

from src.models.user import User
from src.repositories.user_repository import UserRepository
from src.services.payment_service import PaymentService


def _make_repository_with_active_user(user_id):
    repository = UserRepository()
    repository.add(User(user_id=user_id, username=f"user{user_id}", password_hash="x", is_active=True))
    return repository


def test_create_payment_for_active_user():
    service = PaymentService(repository=_make_repository_with_active_user(42))

    payment = service.create_payment(user_id=42, amount=100)

    assert payment.status == "PENDING"
    assert payment.user_id == 42


def test_process_payment_marks_completed_on_success():
    service = PaymentService(repository=_make_repository_with_active_user(7))
    payment = service.create_payment(user_id=7, amount=50)

    processed = service.process_payment(payment.payment_id)

    assert processed.status == "COMPLETED"
