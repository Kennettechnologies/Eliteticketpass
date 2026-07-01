import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.conf import settings


class Notification(models.Model):
    class NotifType(models.TextChoices):
        ORDER_CONFIRMED = "ORDER_CONFIRMED"
        TICKET_TRANSFERRED = "TICKET_TRANSFERRED"
        EVENT_REMINDER = "EVENT_REMINDER"
        EVENT_CANCELLED = "EVENT_CANCELLED"
        EVENT_POSTPONED = "EVENT_POSTPONED"
        EVENT_UPDATED = "EVENT_UPDATED"
        PAYOUT_PROCESSED = "PAYOUT_PROCESSED"
        PAYOUT_FAILED = "PAYOUT_FAILED"
        NEW_ORDER = "NEW_ORDER"
        DAILY_SUMMARY = "DAILY_SUMMARY"
        PROMO_CODE = "PROMO_CODE"
        SYSTEM_ALERT = "SYSTEM_ALERT"
        REFUND_PROCESSED = "REFUND_PROCESSED"
        CHECKIN_SUMMARY = "CHECKIN_SUMMARY"

    class Channel(models.TextChoices):
        EMAIL = "EMAIL"
        SMS = "SMS"
        WHATSAPP = "WHATSAPP"
        IN_APP = "IN_APP"
        PUSH = "PUSH"

    class Status(models.TextChoices):
        PENDING = "PENDING"
        SENT = "SENT"
        DELIVERED = "DELIVERED"
        FAILED = "FAILED"
        READ = "READ"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notifications")
    notif_type = models.CharField(max_length=30, choices=NotifType.choices)
    channel = models.CharField(max_length=15, choices=Channel.choices)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.PENDING)
    subject = models.CharField(max_length=300, blank=True, null=True)
    body = models.TextField()
    metadata = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(null=True, blank=True)
    sent_at = models.DateTimeField(null=True, blank=True)
    delivered_at = models.DateTimeField(null=True, blank=True)
    failed_at = models.DateTimeField(null=True, blank=True)
    fail_reason = models.CharField(max_length=300, blank=True, null=True)
    external_id = models.CharField(max_length=200, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"
        indexes = [
            models.Index(fields=["user"]),
            models.Index(fields=["status"]),
            models.Index(fields=["notif_type"]),
        ]


class NotificationPreference(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notif_preferences")
    notif_type = models.CharField(max_length=30)
    channel = models.CharField(max_length=15)
    enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "notification_preferences"
        unique_together = ("user", "notif_type", "channel")


class PushSubscription(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="push_subscriptions")
    endpoint = models.URLField(max_length=500)
    p256dh = models.CharField(max_length=200)
    auth_key = models.CharField(max_length=100)
    user_agent = models.CharField(max_length=512, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "push_subscriptions"
        unique_together = ("user", "endpoint")


class EmailTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", null=True, blank=True, on_delete=models.CASCADE, related_name="email_templates")
    name = models.CharField(max_length=200)
    template_type = models.CharField(max_length=50)
    subject = models.CharField(max_length=300)
    html_body = models.TextField()
    text_body = models.TextField(blank=True, null=True)
    variables = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "email_templates"


class Announcement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE, related_name="announcements")
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    channels = ArrayField(models.CharField(max_length=50), default=list)
    event = models.ForeignKey("events.Event", null=True, blank=True, on_delete=models.CASCADE, related_name="notification_announcements")
    sent_at = models.DateTimeField(auto_now_add=True)
    recipient_count = models.IntegerField(default=0)

    class Meta:
        db_table = "announcements"


class Automation(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE, related_name="automations")
    trigger = models.CharField(max_length=100)
    trigger_label = models.CharField(max_length=200)
    channel = models.CharField(max_length=50)
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    offset_hours = models.IntegerField(default=0)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "automations"
        unique_together = ("organizer", "trigger", "channel")


class OrganizerTemplate(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE, related_name="custom_templates")
    name = models.CharField(max_length=200)
    subject = models.CharField(max_length=300, blank=True)
    body = models.TextField()
    channel = models.CharField(max_length=50, default="EMAIL")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizer_templates"
