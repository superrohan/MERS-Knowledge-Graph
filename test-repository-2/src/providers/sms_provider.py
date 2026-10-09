"""SMS delivery provider (simulated, never executed)."""


class SmsDeliveryError(Exception):
    """Raised when an SMS cannot be delivered."""


class SmsProvider:
    """Sends transactional SMS messages."""

    def __init__(self):
        self.sent = []

    def send(self, phone_number, message):
        if not phone_number:
            raise SmsDeliveryError("Missing phone number")

        payload = {"phoneNumber": phone_number, "message": message}
        self.sent.append(payload)
        return payload
