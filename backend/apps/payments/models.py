import uuid
from django.db import models
from django.utils import timezone


class Payment(models.Model):
    class Method(models.TextChoices):
        MPESA_STK = "MPESA_STK"
        MPESA_PAYBILL = "MPESA_PAYBILL"
        CARD_STRIPE = "CARD_STRIPE"
        CARD_PAYSTACK = "CARD_PAYSTACK"
        CARD_FLUTTERWAVE = "CARD_FLUTTERWAVE"
        BANK_TRANSFER = "BANK_TRANSFER"
        FREE = "FREE"
        USSD = "USSD"

    class Status(models.TextChoices):
        PENDING = "PENDING"
        PROCESSING = "PROCESSING"
        COMPLETED = "COMPLETED"
        FAILED = "FAILED"
        CANCELLED = "CANCELLED"
        REFUNDED = "REFUNDED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey("orders.Order", on_delete=models.PROTECT, related_name="payments")
    method = models.CharField(max_length=25, choices=Method.choices)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default="KES")

    mpesa_phone = models.CharField(max_length=20, blank=True)
    mpesa_checkout_request_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    mpesa_merchant_request_id = models.CharField(max_length=100, blank=True)
    mpesa_receipt_number = models.CharField(max_length=50, blank=True)
    mpesa_transaction_date = models.DateTimeField(null=True, blank=True)

    stripe_payment_intent_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    stripe_charge_id = models.CharField(max_length=100, blank=True)

    flutterwave_transaction_id = models.CharField(max_length=100, unique=True, null=True, blank=True)

    paystack_reference = models.CharField(max_length=100, unique=True, null=True, blank=True)

    bank_reference = models.CharField(max_length=100, blank=True)
    bank_confirmed_by = models.CharField(max_length=200, blank=True)
    bank_confirmed_at = models.DateTimeField(null=True, blank=True)

    gateway_response = models.JSONField(default=dict, blank=True)
    failure_reason = models.TextField(blank=True)
    retry_count = models.PositiveSmallIntegerField(default=0)

    processed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "payments"
        indexes = [
            models.Index(fields=["order"]),
            models.Index(fields=["status"]),
            models.Index(fields=["mpesa_checkout_request_id"]),
        ]


class OrganizerPayoutProfile(models.Model):
    PAYOUT_METHOD_CHOICES = [
        ('mpesa', 'M-Pesa'),
        ('bank', 'Bank Transfer'),
    ]
    PAYOUT_STATUS_CHOICES = [
        ('pending_verification', 'Pending Verification'),
        ('active', 'Active'),
        ('suspended', 'Suspended'),
    ]

    organizer               = models.OneToOneField(
                                  'organizers.Organizer', on_delete=models.CASCADE,
                                  related_name='payout_profile'
                              )
    payout_method           = models.CharField(
                                  max_length=10,
                                  choices=PAYOUT_METHOD_CHOICES,
                                  default='mpesa'
                              )

    # M-Pesa payout fields
    mpesa_phone             = models.CharField(max_length=15, blank=True)

    # Bank payout fields
    bank_name               = models.CharField(max_length=100, blank=True)
    bank_account_number     = models.CharField(max_length=30, blank=True)
    bank_account_name       = models.CharField(max_length=100, blank=True)
    bank_branch_code        = models.CharField(max_length=20, blank=True)
    paystack_recipient_code = models.CharField(max_length=60, blank=True)

    payout_status           = models.CharField(
                                  max_length=30,
                                  choices=PAYOUT_STATUS_CHOICES,
                                  default='pending_verification'
                              )
    verification_amount     = models.DecimalField(
                                  max_digits=8, decimal_places=2,
                                  null=True, blank=True
                              )
    verified_at             = models.DateTimeField(null=True, blank=True)
    created_at              = models.DateTimeField(auto_now_add=True)
    updated_at              = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.organizer} — {self.payout_method} ({self.payout_status})"


class TicketTransaction(models.Model):
    PAYMENT_GATEWAY_CHOICES = [
        ('daraja', 'Daraja (M-Pesa)'),
        ('paystack', 'Paystack'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('confirmed', 'Confirmed'),
        ('failed', 'Failed'),
        ('refunded', 'Refunded'),
    ]

    id                      = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order                   = models.OneToOneField('orders.Order', on_delete=models.CASCADE,
                                  related_name='transaction')
    gateway                 = models.CharField(max_length=20, choices=PAYMENT_GATEWAY_CHOICES)

    gross_amount            = models.DecimalField(max_digits=12, decimal_places=2)
    platform_fee_rate       = models.DecimalField(max_digits=6, decimal_places=4)
    platform_fee_amount     = models.DecimalField(max_digits=12, decimal_places=2)
    organizer_amount        = models.DecimalField(max_digits=12, decimal_places=2)

    # Daraja-specific
    mpesa_checkout_request_id = models.CharField(max_length=100, blank=True)
    mpesa_merchant_request_id = models.CharField(max_length=100, blank=True)
    mpesa_receipt_number      = models.CharField(max_length=50, blank=True, unique=True,
                                    null=True)

    # Paystack-specific
    paystack_reference        = models.CharField(max_length=100, blank=True, unique=True,
                                    null=True)
    paystack_transaction_id   = models.CharField(max_length=100, blank=True)

    payment_status          = models.CharField(max_length=20, choices=STATUS_CHOICES,
                                  default='pending')
    initiated_at            = models.DateTimeField(auto_now_add=True)
    confirmed_at            = models.DateTimeField(null=True, blank=True)
    raw_gateway_response    = models.JSONField(default=dict)

    class Meta:
        indexes = [
            models.Index(fields=['mpesa_checkout_request_id']),
            models.Index(fields=['paystack_reference']),
            models.Index(fields=['payment_status']),
        ]


class OrganizerPayout(models.Model):
    STATUS_CHOICES = [
        ('queued', 'Queued'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('permanently_failed', 'Permanently Failed'),
    ]

    id                  = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer           = models.ForeignKey('organizers.Organizer', on_delete=models.CASCADE,
                              related_name='ticket_payouts')
    transaction         = models.ForeignKey(TicketTransaction, on_delete=models.CASCADE,
                              related_name='organizer_payouts', null=True, blank=True)
    reference           = models.CharField(max_length=50, blank=True, unique=True)
    amount              = models.DecimalField(max_digits=12, decimal_places=2)
    method              = models.CharField(max_length=10)
    status              = models.CharField(max_length=30, choices=STATUS_CHOICES,
                              default='queued')
    retry_count         = models.IntegerField(default=0)
    max_retries         = models.IntegerField(default=3)
    next_retry_at       = models.DateTimeField(null=True, blank=True)
    disbursed_at        = models.DateTimeField(null=True, blank=True)
    failure_reason      = models.TextField(blank=True)
    external_ref        = models.CharField(max_length=150, blank=True)
    raw_disbursement_response = models.JSONField(default=dict)
    created_at          = models.DateTimeField(default=timezone.now)

    class Meta:
        indexes = [
            models.Index(fields=['status']),
            models.Index(fields=['organizer', 'status']),
            models.Index(fields=['next_retry_at']),
        ]


class PlatformRevenue(models.Model):
    transaction     = models.OneToOneField(TicketTransaction, on_delete=models.CASCADE,
                          related_name='platform_revenue')
    amount          = models.DecimalField(max_digits=12, decimal_places=2)
    gateway         = models.CharField(max_length=20)
    recorded_at     = models.DateTimeField(auto_now_add=True)
    swept_to_account = models.BooleanField(default=False)
    swept_at        = models.DateTimeField(null=True, blank=True)
    notes           = models.TextField(blank=True)


class WebhookLog(models.Model):
    SOURCE_CHOICES = [('daraja', 'Daraja'), ('paystack', 'Paystack')]

    id              = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    source          = models.CharField(max_length=20, choices=SOURCE_CHOICES)
    event_type      = models.CharField(max_length=100)
    raw_payload     = models.JSONField()
    headers         = models.JSONField(default=dict)
    signature_valid = models.BooleanField(default=False)
    processed       = models.BooleanField(default=False)
    processing_error = models.TextField(blank=True)
    received_at     = models.DateTimeField(auto_now_add=True)
    ip_address      = models.GenericIPAddressField(null=True)


class ResaleTransaction(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        COMPLETED = "COMPLETED"
        FAILED = "FAILED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    ticket = models.ForeignKey("tickets.Ticket", on_delete=models.PROTECT, related_name="resale_transactions")
    buyer = models.ForeignKey("users.User", on_delete=models.SET_NULL, null=True, related_name="resale_purchases")
    seller = models.ForeignKey("users.User", on_delete=models.PROTECT, related_name="resale_sales")
    
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    platform_fee = models.DecimalField(max_digits=10, decimal_places=2)
    seller_payout = models.DecimalField(max_digits=10, decimal_places=2)
    
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    payment_reference = models.CharField(max_length=100, unique=True, null=True, blank=True)
    gateway = models.CharField(max_length=20, default="MPESA_STK")
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "resale_transactions"

