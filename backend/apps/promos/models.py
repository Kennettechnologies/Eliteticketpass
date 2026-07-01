import uuid
from django.db import models
from django.conf import settings


class PromoCode(models.Model):
    class PromoType(models.TextChoices):
        PERCENTAGE = "PERCENTAGE"
        FIXED_AMOUNT = "FIXED_AMOUNT"
        
    class CodeType(models.TextChoices):
        PROMO = "PROMO"
        REFERRAL = "REFERRAL"
        BULK = "BULK"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    organizer = models.ForeignKey("organizers.Organizer", on_delete=models.CASCADE, related_name="promo_codes")
    code = models.CharField(max_length=50, unique=True)
    description = models.CharField(max_length=300, blank=True)
    promo_type = models.CharField(max_length=15, choices=PromoType.choices)
    value = models.DecimalField(max_digits=10, decimal_places=2)
    usage_limit = models.PositiveIntegerField(null=True, blank=True)
    usage_count = models.PositiveIntegerField(default=0)
    per_user_limit = models.PositiveSmallIntegerField(default=1)
    min_order_amount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_discount = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    valid_from = models.DateTimeField(null=True, blank=True)
    valid_until = models.DateTimeField(null=True, blank=True)
    
    code_type = models.CharField(max_length=15, choices=CodeType.choices, default=CodeType.PROMO)
    events = models.ManyToManyField("events.Event", blank=True, related_name="promo_codes")
    applicable_tiers = models.ManyToManyField("events.TicketTier", blank=True, related_name="promo_codes")
    referral_owner = models.CharField(max_length=200, blank=True, null=True)
    
    is_active = models.BooleanField(default=True)
    is_referral = models.BooleanField(default=False)
    referral_user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "promo_codes"

    def __str__(self):
        return self.code


class PromoCodeTier(models.Model):
    promo_code = models.ForeignKey(PromoCode, on_delete=models.CASCADE, related_name="tier_restrictions")
    tier = models.ForeignKey("events.TicketTier", on_delete=models.CASCADE)

    class Meta:
        db_table = "promo_code_tiers"
        unique_together = ("promo_code", "tier")


class PromoCodeUsage(models.Model):
    promo_code = models.ForeignKey(PromoCode, on_delete=models.CASCADE, related_name="usages")
    order = models.OneToOneField("orders.Order", on_delete=models.CASCADE, related_name="promo_usage")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    discount_amount = models.DecimalField(max_digits=10, decimal_places=2)
    used_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "promo_code_usages"
        indexes = [models.Index(fields=["promo_code"])]
