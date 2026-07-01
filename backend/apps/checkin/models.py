import uuid
from django.db import models
from django.conf import settings


class CheckInSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey("events.Event", on_delete=models.CASCADE, related_name="checkin_sessions")
    name = models.CharField(max_length=200)
    access_code = models.CharField(max_length=20, unique=True)
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="created_sessions")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "checkin_sessions"
        indexes = [
            models.Index(fields=["event"]),
            models.Index(fields=["access_code"]),
        ]

    def __str__(self):
        return f"{self.event} – {self.name}"


class GateStaffAssignment(models.Model):
    session = models.ForeignKey(CheckInSession, on_delete=models.CASCADE, related_name="staff_assignments")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="gate_assignments")
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE)
    granted_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="granted_assignments")
    created_at = models.DateTimeField(auto_now_add=True)
    revoked_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "gate_staff_assignments"
        unique_together = ("session", "user")


class ScanLog(models.Model):
    class Result(models.TextChoices):
        VALID = "VALID"
        INVALID = "INVALID"
        ALREADY_USED = "ALREADY_USED"
        CANCELLED = "CANCELLED"
        EVENT_NOT_STARTED = "EVENT_NOT_STARTED"
        EVENT_ENDED = "EVENT_ENDED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    session = models.ForeignKey(CheckInSession, on_delete=models.CASCADE, related_name="scan_logs")
    ticket = models.ForeignKey("tickets.Ticket", null=True, blank=True, on_delete=models.SET_NULL, related_name="scan_logs")
    scanned_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    qr_token = models.CharField(max_length=100)
    result = models.CharField(max_length=20, choices=Result.choices)
    gate = models.CharField(max_length=100, blank=True)
    device_info = models.CharField(max_length=255, blank=True, null=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    scanned_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "scan_logs"
        indexes = [
            models.Index(fields=["session"]),
            models.Index(fields=["ticket"]),
            models.Index(fields=["scanned_at"]),
        ]
