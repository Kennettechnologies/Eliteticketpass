import uuid
from django.db import models
from django.conf import settings


class Organizer(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING"
        APPROVED = "APPROVED"
        REJECTED = "REJECTED"
        SUSPENDED = "SUSPENDED"

    class Tier(models.TextChoices):
        BASIC = "BASIC"
        VERIFIED = "VERIFIED"
        PREMIUM = "PREMIUM"

    class BusinessType(models.TextChoices):
        INDIVIDUAL = "individual"
        COMPANY = "company"
        NGO = "ngo"

    class KycStatus(models.TextChoices):
        NOT_SUBMITTED = "NOT_SUBMITTED"
        PENDING_REVIEW = "PENDING_REVIEW"
        APPROVED = "APPROVED"
        REJECTED = "REJECTED"
        EXPIRED = "EXPIRED"

    class PayoutMethod(models.TextChoices):
        MPESA = "MPESA"
        BANK_TRANSFER = "BANK_TRANSFER"

    class PayoutSchedule(models.TextChoices):
        INSTANT = "INSTANT"
        POST_EVENT = "POST_EVENT"
        ON_DEMAND = "ON_DEMAND"

    class FeeAbsorbedBy(models.TextChoices):
        BUYER = "buyer"
        ORGANIZER = "organizer"

    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="organizer_profile")
    slug = models.SlugField(max_length=120, unique=True)
    name = models.CharField(max_length=200)
    display_name = models.CharField(max_length=200, blank=True)
    logo_url = models.URLField(max_length=500, blank=True)
    banner_url = models.URLField(max_length=500, blank=True)
    bio = models.TextField(blank=True)
    website_url = models.URLField(max_length=300, blank=True)
    facebook_url = models.URLField(max_length=300, blank=True)
    twitter_url = models.URLField(max_length=300, blank=True)
    instagram_url = models.URLField(max_length=300, blank=True)
    youtube_url = models.URLField(max_length=300, blank=True)

    business_type = models.CharField(max_length=20, choices=BusinessType.choices, default=BusinessType.INDIVIDUAL)
    registration_number = models.CharField(max_length=100, blank=True)
    tax_pin = models.CharField(max_length=50, blank=True)
    contact_email = models.EmailField(blank=True)
    contact_phone = models.CharField(max_length=20, blank=True)
    contact_address = models.CharField(max_length=300, blank=True)

    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    tier = models.CharField(max_length=20, choices=Tier.choices, default=Tier.BASIC)
    is_verified = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)

    custom_fee_percent = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    custom_fee_flat = models.DecimalField(max_digits=8, decimal_places=2, null=True, blank=True)
    fee_absorbed_by = models.CharField(max_length=20, choices=FeeAbsorbedBy.choices, default=FeeAbsorbedBy.BUYER)
    
    fee_agreement_accepted = models.BooleanField(default=False)
    fee_agreement_accepted_at = models.DateTimeField(null=True, blank=True)

    payout_schedule = models.CharField(max_length=20, choices=PayoutSchedule.choices, default=PayoutSchedule.ON_DEMAND)
    auto_payout_days_after = models.PositiveSmallIntegerField(default=3)
    payout_method = models.CharField(max_length=20, choices=PayoutMethod.choices, default=PayoutMethod.MPESA)
    mpesa_phone = models.CharField(max_length=20, blank=True)
    bank_name = models.CharField(max_length=100, blank=True)
    bank_account_name = models.CharField(max_length=200, blank=True)
    bank_account_number = models.CharField(max_length=50, blank=True)
    bank_branch = models.CharField(max_length=100, blank=True)

    kyc_status = models.CharField(max_length=20, choices=KycStatus.choices, default=KycStatus.NOT_SUBMITTED)
    kyc_submitted_at = models.DateTimeField(null=True, blank=True)
    kyc_reviewed_at = models.DateTimeField(null=True, blank=True)
    kyc_reviewed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL,
        related_name="kyc_reviews"
    )
    kyc_rejection_note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "organizers"
        indexes = [models.Index(fields=["slug"]), models.Index(fields=["status"])]

    def __str__(self):
        return self.name


class KycDocument(models.Model):
    class DocType(models.TextChoices):
        NATIONAL_ID = "national_id"
        PASSPORT = "passport"
        REG_CERT = "reg_cert"
        KRA_PIN = "kra_pin"

    class Status(models.TextChoices):
        PENDING_REVIEW = "PENDING_REVIEW"
        APPROVED = "APPROVED"
        REJECTED = "REJECTED"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey(Organizer, on_delete=models.CASCADE, related_name="kyc_documents")
    doc_type = models.CharField(max_length=20, choices=DocType.choices)
    file_url = models.URLField(max_length=500)
    file_name = models.CharField(max_length=255, blank=True)
    file_size = models.PositiveIntegerField(null=True, blank=True)
    mime_type = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING_REVIEW)
    review_note = models.TextField(blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = "kyc_documents"


class OrganizerFollower(models.Model):
    organizer = models.ForeignKey(Organizer, on_delete=models.CASCADE, related_name="followers")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="followed_organizers")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "organizer_followers"
        unique_together = ("organizer", "user")
