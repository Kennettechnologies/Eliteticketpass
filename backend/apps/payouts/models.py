import uuid
from django.db import models
from django.conf import settings


class Payout(models.Model):
    class Method(models.TextChoices):
        MPESA = "MPESA"
        BANK_TRANSFER = "BANK_TRANSFER"

    class Status(models.TextChoices):
        PENDING = "PENDING"
        PROCESSING = "PROCESSING"
        COMPLETED = "COMPLETED"
        FAILED = "FAILED"
        CANCELLED = "CANCELLED"
        ON_HOLD = "ON_HOLD"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.PROTECT, related_name="payouts")
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    deduction_amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    deduction_reason = models.CharField(max_length=200, blank=True)
    net_amount = models.DecimalField(max_digits=14, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")
    method = models.CharField(max_length=20, choices=Method.choices)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)

    mpesa_phone = models.CharField(max_length=20, blank=True)
    mpesa_receipt = models.CharField(max_length=50, blank=True)

    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_branch = models.CharField(max_length=100, blank=True)
    bank_reference = models.CharField(max_length=100, blank=True)

    requested_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="payout_requests")
    approved_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="payout_approvals")
    approved_at = models.DateTimeField(null=True, blank=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    failure_reason = models.TextField(blank=True)
    gateway_response = models.JSONField(default=dict, blank=True)
    notes = models.TextField(blank=True)

    period_from = models.DateField(null=True, blank=True)
    period_to = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payouts"
        indexes = [
            models.Index(fields=["organizer"]),
            models.Index(fields=["status"]),
        ]


class PayoutItem(models.Model):
    payout = models.ForeignKey(Payout, on_delete=models.CASCADE, related_name="items")
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT)
    amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "payout_items"
        indexes = [models.Index(fields=["payout"])]
