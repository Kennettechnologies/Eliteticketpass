import uuid
from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models
from django.utils import timezone


class UserManager(BaseUserManager):
    def create_user(self, email=None, phone=None, password=None, **extra):
        if not email and not phone:
            raise ValueError("Email or phone is required.")
        if email:
            email = self.normalize_email(email)
        user = self.model(email=email, phone=phone, **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra):
        extra.setdefault("role", "SUPER_ADMIN")
        extra.setdefault("is_staff", True)
        extra.setdefault("is_superuser", True)
        extra.setdefault("status", "ACTIVE")
        extra.setdefault("email_verified", True)
        return self.create_user(email=email, password=password, **extra)


class User(AbstractBaseUser, PermissionsMixin):
    class Role(models.TextChoices):
        SUPER_ADMIN = "SUPER_ADMIN", "Super Admin"
        ADMIN = "ADMIN", "Admin"
        ORGANIZER = "ORGANIZER", "Organizer"
        GATE_STAFF = "GATE_STAFF", "Gate Staff"
        BUYER = "BUYER", "Buyer"

    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        SUSPENDED = "SUSPENDED", "Suspended"
        BANNED = "BANNED", "Banned"
        PENDING_VERIFICATION = "PENDING_VERIFICATION", "Pending Verification"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True, null=True, blank=True)
    phone = models.CharField(max_length=20, unique=True, null=True, blank=True)
    role = models.CharField(max_length=20, choices=Role.choices, default=Role.BUYER)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING_VERIFICATION)

    first_name = models.CharField(max_length=100, blank=True)
    last_name = models.CharField(max_length=100, blank=True)
    display_name = models.CharField(max_length=150, blank=True)
    avatar_url = models.URLField(max_length=500, blank=True)
    bio = models.TextField(blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    country_code = models.CharField(max_length=3, default="KE")
    city = models.CharField(max_length=100, blank=True)
    timezone = models.CharField(max_length=50, default="Africa/Nairobi")

    email_verified = models.BooleanField(default=False)
    phone_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    phone_verified_at = models.DateTimeField(null=True, blank=True)

    two_factor_enabled = models.BooleanField(default=False)
    two_factor_secret = models.CharField(max_length=64, blank=True)

    last_login_at = models.DateTimeField(null=True, blank=True)
    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    failed_login_count = models.PositiveSmallIntegerField(default=0)
    locked_until = models.DateTimeField(null=True, blank=True)

    marketing_emails = models.BooleanField(default=True)
    sms_notifications = models.BooleanField(default=True)
    push_notifications = models.BooleanField(default=True)
    language = models.CharField(max_length=10, default="en")

    is_staff = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    deleted_at = models.DateTimeField(null=True, blank=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    REQUIRED_FIELDS = []

    class Meta:
        db_table = "users"
        indexes = [
            models.Index(fields=["email"]),
            models.Index(fields=["phone"]),
            models.Index(fields=["role"]),
            models.Index(fields=["status"]),
        ]

    def __str__(self):
        return self.email or self.phone or str(self.id)

    @property
    def full_name(self) -> str:
        return f"{self.first_name} {self.last_name}".strip() or self.display_name or str(self.email or self.phone)

    def is_locked(self) -> bool:
        if self.locked_until and self.locked_until > timezone.now():
            return True
        return False

    def increment_failed_login(self):
        self.failed_login_count += 1
        if self.failed_login_count >= 5:
            from datetime import timedelta
            self.locked_until = timezone.now() + timedelta(minutes=15)
        self.save(update_fields=["failed_login_count", "locked_until"])

    def reset_failed_login(self):
        self.failed_login_count = 0
        self.locked_until = None
        self.save(update_fields=["failed_login_count", "locked_until"])


class UserSession(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="sessions")
    refresh_token_jti = models.CharField(max_length=255, unique=True)
    device_info = models.CharField(max_length=255, blank=True)
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True)
    expires_at = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "user_sessions"


class OAuthAccount(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="oauth_accounts")
    provider = models.CharField(max_length=30)  # google, facebook
    provider_user_id = models.CharField(max_length=255)
    access_token = models.TextField(blank=True)
    refresh_token = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "oauth_accounts"
        unique_together = ("provider", "provider_user_id")


class OtpCode(models.Model):
    class OtpType(models.TextChoices):
        PHONE_VERIFY = "phone_verify"
        EMAIL_VERIFY = "email_verify"
        LOGIN = "login"
        PASSWORD_RESET = "password_reset"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="otp_codes")
    otp_type = models.CharField(max_length=20, choices=OtpType.choices)
    code = models.CharField(max_length=6)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    attempt_count = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "otp_codes"

    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now() and self.attempt_count < 5


class PasswordResetToken(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField()
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "password_reset_tokens"

    def is_valid(self) -> bool:
        return self.used_at is None and self.expires_at > timezone.now()


class UserPayoutProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="payout_profile")
    # mpesa_phone = models.CharField(max_length=20, blank=True)
    paystack_bank_code = models.CharField(max_length=20, blank=True)
    paystack_account_number = models.CharField(max_length=50, blank=True)
    paystack_recipient_code = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "user_payout_profiles"

