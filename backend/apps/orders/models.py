import uuid
from django.db import models
from django.conf import settings


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        AWAITING_PAYMENT = "AWAITING_PAYMENT"
        CONFIRMED = "CONFIRMED"
        CANCELLED = "CANCELLED"
        REFUNDED = "REFUNDED"
        PARTIALLY_REFUNDED = "PARTIALLY_REFUNDED"
        DISPUTED = "DISPUTED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order_number = models.CharField(max_length=20, unique=True, blank=True)
    event = models.ForeignKey("events.Event", on_delete=models.PROTECT, related_name="orders")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="orders")
    status = models.CharField(max_length=25, choices=Status.choices, default=Status.PENDING)

    buyer_first_name = models.CharField(max_length=100, blank=True)
    buyer_last_name = models.CharField(max_length=100, blank=True)
    buyer_email = models.EmailField(blank=True)
    buyer_phone = models.CharField(max_length=20, blank=True)
    buyer_city = models.CharField(max_length=100, blank=True)

    subtotal = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    discount_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    platform_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total = models.DecimalField(max_digits=12, decimal_places=2, default=0)

    hold_token = models.UUIDField(unique=True, null=True, blank=True)
    hold_expires_at = models.DateTimeField(null=True, blank=True)

    promo_code = models.ForeignKey("promos.PromoCode", null=True, blank=True, on_delete=models.SET_NULL)

    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    referral_source = models.CharField(max_length=100, blank=True)
    notes = models.TextField(blank=True)

    cancel_reason = models.TextField(blank=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    confirmed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    integrity_hash = models.CharField(max_length=64, blank=True)

    class Meta:
        db_table = "orders"
        indexes = [
            models.Index(fields=["event"]),
            models.Index(fields=["user"]),
            models.Index(fields=["status"]),
            models.Index(fields=["order_number"]),
            models.Index(fields=["buyer_email"]),
        ]

    def __str__(self):
        return self.order_number or str(self.id)

    def _generate_hash(self):
        import hashlib
        sub = f"{self.subtotal:.2f}" if self.subtotal else "0.00"
        disc = f"{self.discount_amount:.2f}" if self.discount_amount else "0.00"
        plat = f"{self.platform_fee:.2f}" if self.platform_fee else "0.00"
        tot = f"{self.total:.2f}" if self.total else "0.00"
        data = f"{self.id}:{self.order_number}:{sub}:{disc}:{plat}:{tot}:{self.status}:{settings.SECRET_KEY}"
        return hashlib.sha256(data.encode('utf-8')).hexdigest()

    def verify_integrity(self):
        if not self.integrity_hash:
            return True # Missing hash (e.g. legacy or un-hashed)
        expected = self._generate_hash()
        return self.integrity_hash == expected

    def save(self, *args, **kwargs):
        # Always update the integrity hash before saving
        self.integrity_hash = self._generate_hash()
        if 'update_fields' in kwargs and 'integrity_hash' not in kwargs['update_fields']:
            kwargs['update_fields'] = list(kwargs['update_fields']) + ['integrity_hash']
        super().save(*args, **kwargs)


class OrderItem(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    tier = models.ForeignKey("events.TicketTier", on_delete=models.PROTECT, related_name="order_items")
    quantity = models.PositiveSmallIntegerField()
    unit_price = models.DecimalField(max_digits=10, decimal_places=2)
    subtotal = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        db_table = "order_items"
        indexes = [models.Index(fields=["order"])]
