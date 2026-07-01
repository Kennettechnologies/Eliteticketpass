import uuid
from django.db import models
from django.conf import settings


class PlatformConfig(models.Model):
    key = models.CharField(max_length=100, unique=True)
    value = models.TextField()
    description = models.CharField(max_length=300, blank=True)
    is_public = models.BooleanField(default=False)
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    updated_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "platform_configs"


class HomepageSlot(models.Model):
    class SlotType(models.TextChoices):
        BANNER = "banner"
        FEATURED = "featured"
        TRENDING = "trending"

    event = models.ForeignKey("events.Event", null=True, blank=True, on_delete=models.SET_NULL, related_name="homepage_slots")
    slot_type = models.CharField(max_length=15, choices=SlotType.choices)
    position = models.PositiveSmallIntegerField()
    image_url = models.URLField(max_length=500, blank=True, null=True)
    link_url = models.URLField(max_length=500, blank=True, null=True)
    title = models.CharField(max_length=200, blank=True, null=True)
    is_active = models.BooleanField(default=True)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "homepage_slots"
        ordering = ["position"]


class AuditLog(models.Model):
    class Action(models.TextChoices):
        CREATE = "CREATE"
        UPDATE = "UPDATE"
        DELETE = "DELETE"
        LOGIN = "LOGIN"
        LOGOUT = "LOGOUT"
        PAYMENT = "PAYMENT"
        REFUND = "REFUND"
        CHECKIN = "CHECKIN"
        PAYOUT = "PAYOUT"
        SUSPEND = "SUSPEND"
        BAN = "BAN"
        APPROVE = "APPROVE"
        REJECT = "REJECT"
        IMPERSONATE = "IMPERSONATE"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="audit_logs")
    action = models.CharField(max_length=20, choices=Action.choices)
    entity = models.CharField(max_length=100)
    entity_id = models.CharField(max_length=100, blank=True, null=True)
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(null=True, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "audit_logs"
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["entity", "entity_id"]),
            models.Index(fields=["action"]),
            models.Index(fields=["created_at"]),
        ]


class ImpersonationLog(models.Model):
    impersonator = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="impersonations_done")
    impersonated = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="impersonations_received")
    reason = models.TextField()
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "impersonation_logs"


class MaintenanceWindow(models.Model):
    message = models.TextField()
    is_active = models.BooleanField(default=False)
    starts_at = models.DateTimeField(null=True, blank=True)
    ends_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "maintenance_windows"

class ReportSubscription(models.Model):
    class Frequency(models.TextChoices):
        DAILY = "DAILY"
        WEEKLY = "WEEKLY"
        MONTHLY = "MONTHLY"
        
    class ReportType(models.TextChoices):
        REVENUE = "REVENUE"
        USER_GROWTH = "USER_GROWTH"
        EVENT_PERFORMANCE = "EVENT_PERFORMANCE"
        LIABILITIES = "LIABILITIES"
        
    email = models.EmailField()
    report_type = models.CharField(max_length=30, choices=ReportType.choices)
    frequency = models.CharField(max_length=20, choices=Frequency.choices)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = "report_subscriptions"
        unique_together = ["email", "report_type", "frequency"]


class PlatformFeeSetting(models.Model):
    platform_fee = models.CharField(max_length=200, default="5% of ticket face value")
    payment_processing_mpesa = models.CharField(max_length=200, default="1.5% + KES 20 per transaction")
    payment_processing_card = models.CharField(max_length=200, default="2.9% + KES 30 per transaction")
    bank_transfer_fee = models.CharField(max_length=200, default="KES 50 flat per payout")
    free_events_fee = models.CharField(max_length=200, default="No charge")
    payout_schedule = models.CharField(max_length=200, default="5-7 business days after event date")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "platform_fee_settings"
        verbose_name = "Platform Fee Setting"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)
