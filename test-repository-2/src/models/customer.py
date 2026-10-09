"""Customer domain model."""


class Customer:
    """A customer who can place orders and receive notifications."""

    def __init__(self, customer_id, email, phone_number=None, marketing_opt_in=False):
        self.customer_id = customer_id
        self.email = email
        self.phone_number = phone_number
        self.marketing_opt_in = marketing_opt_in
