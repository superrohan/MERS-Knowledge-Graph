"""Persistence for Customer records (in-memory, self-contained fixture)."""

from src.models.customer import Customer


class CustomerRepository:
    """Stores and looks up Customer records."""

    def __init__(self):
        self._customers_by_id = {}

    def add(self, customer):
        self._customers_by_id[customer.customer_id] = customer
        return customer

    def find(self, customer_id):
        return self._customers_by_id.get(customer_id)
