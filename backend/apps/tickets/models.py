import uuid
from django.db import models
from django.conf import settings


class Ticket(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE"
        USED = "USED"
        CANCELLED = "CANCELLED"
        TRANSFERRED = "TRANSFERRED"
        EXPIRED = "EXPIRED"
        FOR_RESALE = "FOR_RESALE"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket_number = models.CharField(max_length=20, unique=True, blank=True)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="tickets")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    tier = models.ForeignKey("events.TicketTier", null=True, blank=True, on_delete=models.SET_NULL, related_name="tickets")
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.ACTIVE)
    
    resale_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    qr_token = models.UUIDField(unique=True, default=uuid.uuid4)
    qr_code_url = models.TextField(blank=True)

    holder_name = models.CharField(max_length=200)
    holder_email = models.EmailField(blank=True)
    holder_phone = models.CharField(max_length=20, blank=True)

    checked_in_at = models.DateTimeField(null=True, blank=True)
    checked_in_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="check_ins"
    )
    check_in_gate = models.CharField(max_length=100, blank=True)
    used_at = models.DateTimeField(null=True, blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True)

    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "tickets"
        indexes = [
            models.Index(fields=["order"]),
            models.Index(fields=["user"]),
            models.Index(fields=["qr_token"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.ticket_number or str(self.id)


class TicketTransfer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        ACCEPTED = "ACCEPTED"
        EXPIRED = "EXPIRED"
        CANCELLED = "CANCELLED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey(Ticket, on_delete=models.CASCADE, related_name="transfers")
    from_user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="transfers_sent")
    to_email = models.EmailField()
    to_phone = models.CharField(max_length=20, blank=True)
    to_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="transfers_received"
    )
    transfer_token = models.UUIDField(unique=True, default=uuid.uuid4)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    expires_at = models.DateTimeField()
    accepted_at = models.DateTimeField(null=True, blank=True)
    decline_reason = models.TextField(blank=True)
    declined_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "ticket_transfers"
        indexes = [
            models.Index(fields=["ticket"]),
            models.Index(fields=["transfer_token"]),
        ]
