import uuid
from django.db import models
from django.contrib.postgres.fields import ArrayField
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator


class EventCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True)
    icon_url = models.URLField(max_length=300, blank=True)
    color_hex = models.CharField(max_length=7, default="#f59e0b")
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "event_categories"
        ordering = ["sort_order", "name"]

    def __str__(self):
        return self.name


class Event(models.Model):
    class EventType(models.TextChoices):
        PHYSICAL = "PHYSICAL"
        ONLINE = "ONLINE"
        HYBRID = "HYBRID"

    class Status(models.TextChoices):
        DRAFT = "DRAFT"
        PUBLISHED = "PUBLISHED"
        CANCELLED = "CANCELLED"
        POSTPONED = "POSTPONED"
        COMPLETED = "COMPLETED"
        UNDER_REVIEW = "UNDER_REVIEW"

    class OnlinePlatform(models.TextChoices):
        ZOOM = "zoom"
        YOUTUBE = "youtube"
        CUSTOM = "custom"

    class FeeAbsorbedBy(models.TextChoices):
        BUYER = "buyer"
        ORGANIZER = "organizer"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE, related_name="events")
    slug = models.SlugField(max_length=200, unique=True)
    title = models.CharField(max_length=300)
    description = models.TextField()
    short_description = models.CharField(max_length=300, blank=True)
    cover_image_url = models.URLField(max_length=500, blank=True)
    promo_video_url = models.URLField(max_length=500, blank=True)

    event_type = models.CharField(max_length=10, choices=EventType.choices, default=EventType.PHYSICAL)
    status = models.CharField(max_length=15, choices=Status.choices, default=Status.DRAFT)
    category = models.ForeignKey(EventCategory, null=True, blank=True, on_delete=models.SET_NULL, related_name="events")
    tags = ArrayField(models.CharField(max_length=50), default=list, blank=True)

    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField()
    doors_open_at = models.DateTimeField(null=True, blank=True)
    timezone = models.CharField(max_length=50, default="Africa/Nairobi")
    is_recurring = models.BooleanField(default=False)

    venue_name = models.CharField(max_length=200, blank=True)
    venue_address = models.CharField(max_length=300, blank=True)
    venue_city = models.CharField(max_length=100, blank=True)
    venue_county = models.CharField(max_length=100, blank=True)
    venue_country = models.CharField(max_length=3, default="KE")
    venue_latitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    venue_longitude = models.DecimalField(max_digits=10, decimal_places=7, null=True, blank=True)
    venue_capacity = models.PositiveIntegerField(null=True, blank=True)
    venue_map_url = models.URLField(max_length=500, blank=True)

    online_url = models.URLField(max_length=500, blank=True)
    online_password = models.CharField(max_length=100, blank=True)
    online_platform = models.CharField(max_length=20, choices=OnlinePlatform.choices, blank=True)

    age_restriction = models.PositiveSmallIntegerField(null=True, blank=True)
    dress_code = models.CharField(max_length=200, blank=True)
    entry_rules = models.TextField(blank=True)
    faq = models.JSONField(default=list, blank=True)
    ticket_terms = models.TextField(blank=True)
    max_per_order = models.PositiveSmallIntegerField(default=10)

    is_public = models.BooleanField(default=True)
    is_featured = models.BooleanField(default=False)
    is_free = models.BooleanField(default=False)
    publish_at = models.DateTimeField(null=True, blank=True)
    
    checkin_access_code = models.CharField(max_length=50, blank=True, unique=True, null=True)

    cancel_reason = models.TextField(blank=True)
    postponed_to = models.DateTimeField(null=True, blank=True)
    postpone_note = models.TextField(blank=True)

    custom_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    custom_fee_flat = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    fee_absorbed_by = models.CharField(max_length=20, choices=FeeAbsorbedBy.choices, default=FeeAbsorbedBy.BUYER)

    view_count = models.PositiveIntegerField(default=0)
    share_count = models.PositiveIntegerField(default=0)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "events"
        indexes = [
            models.Index(fields=["organizer"]),
            models.Index(fields=["status"]),
            models.Index(fields=["starts_at"]),
            models.Index(fields=["slug"]),
            models.Index(fields=["category"]),
        ]

    def __str__(self):
        return self.title

    @property
    def min_price(self):
        tiers = self.ticket_tiers.filter(is_active=True)
        if not tiers.exists():
            return None
        return tiers.order_by("price").values_list("price", flat=True).first()

    @property
    def max_price(self):
        tiers = self.ticket_tiers.filter(is_active=True)
        if not tiers.exists():
            return None
        return tiers.order_by("-price").values_list("price", flat=True).first()

    @property
    def tickets_remaining(self):
        return self.ticket_tiers.filter(is_active=True).extra(
            where=["quantity - sold - reserved > 0"]
        ).exists()


class TicketTier(models.Model):
    class Visibility(models.TextChoices):
        PUBLIC = "PUBLIC"
        HIDDEN = "HIDDEN"
        INVITE_ONLY = "INVITE_ONLY"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="ticket_tiers")
    name = models.CharField(max_length=150)
    description = models.CharField(max_length=300, blank=True)
    price = models.DecimalField(max_digits=10, decimal_places=2)
    quantity = models.PositiveIntegerField()
    sold = models.PositiveIntegerField(default=0)
    reserved = models.PositiveIntegerField(default=0)
    max_per_order = models.PositiveSmallIntegerField(default=10)
    min_per_order = models.PositiveSmallIntegerField(default=1)
    visibility = models.CharField(max_length=15, choices=Visibility.choices, default=Visibility.PUBLIC)
    sale_starts_at = models.DateTimeField(null=True, blank=True)
    sale_ends_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_free = models.BooleanField(default=False)
    is_group_tier = models.BooleanField(default=False)
    group_size = models.PositiveSmallIntegerField(null=True, blank=True)
    color = models.CharField(max_length=7, blank=True)
    perks = ArrayField(models.CharField(max_length=100), default=list, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "ticket_tiers"
        indexes = [models.Index(fields=["event"])]
        ordering = ["sort_order", "price"]

    @property
    def available(self) -> int:
        return max(0, self.quantity - self.sold - self.reserved)

    def __str__(self):
        return f"{self.event.title} — {self.name}"


class EventGallery(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="gallery")
    image_url = models.URLField(max_length=500)
    caption = models.CharField(max_length=200, blank=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "event_gallery"
        ordering = ["sort_order"]


class SavedEvent(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="saved_events")
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="saved_by")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "saved_events"
        unique_together = ("user", "event")


class EventReview(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="reviews")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reviews")
    rating = models.PositiveSmallIntegerField(validators=[MinValueValidator(1), MaxValueValidator(5)])
    body = models.TextField(blank=True, null=True)
    is_visible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "event_reviews"
        unique_together = ("event", "user")


class EventAnnouncement(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="announcements")
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE)
    subject = models.CharField(max_length=200)
    body = models.TextField()
    channels = ArrayField(models.CharField(max_length=20), default=list)
    sent_at = models.DateTimeField(null=True, blank=True)
    recipient_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "event_announcements"


class RefundPolicy(models.Model):
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="refund_policies")
    days_before_event = models.PositiveSmallIntegerField()
    refund_percent = models.DecimalField(max_digits=5, decimal_places=2)
    description = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "refund_policies"
        ordering = ["-days_before_event"]


class RecurringEvent(models.Model):
    parent_event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="occurrences")
    occurrence_date = models.DateField()
    status = models.CharField(max_length=15, default="SCHEDULED")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "recurring_events"


class CheckinStaff(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    event = models.ForeignKey(Event, on_delete=models.CASCADE, related_name="checkin_staff")
    name = models.CharField(max_length=100, blank=True)
    email = models.EmailField()
    last_active = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "checkin_staff"
        unique_together = ("event", "email")
